// Configure apenas os valores públicos do projeto Supabase; nunca use a chave service_role no navegador.
const SUPABASE_URL = "https://qztyhlbyjoburxbbmgfl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UUXD5DqDHXQLGvdu5_-MHg_YMEBUfaj";
const AUTH_SESSION_KEY = "finpulse-supabase-session";
const DEMO_ACCOUNTS_KEY = "finpulse-demo-accounts";

// Dados financeiros ficam separados por usuário no armazenamento deste dispositivo.
const STORAGE_KEYS = {
  theme: "finpulse-theme",
  transactions: "finpulse-transactions"
};
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const displayDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

// Datas relativas mantêm os exemplos recentes independentemente do dia em que o painel for aberto.
function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const sampleTransactions = [
  { id: "sample-1", description: "Salário", type: "entrada", date: dateDaysAgo(2), amount: 5800 },
  { id: "sample-2", description: "Aluguel", type: "saida", date: dateDaysAgo(4), amount: 1850 },
  { id: "sample-3", description: "Freelance", type: "entrada", date: dateDaysAgo(6), amount: 950 },
  { id: "sample-4", description: "Supermercado", type: "saida", date: dateDaysAgo(8), amount: 428.6 },
  { id: "sample-5", description: "Internet", type: "saida", date: dateDaysAgo(10), amount: 119.9 }
];
const currencies = [
  { key: "USDBRL", name: "Dólar americano", code: "USD", icon: "$" },
  { key: "EURBRL", name: "Euro", code: "EUR", icon: "€" },
  { key: "BTCBRL", name: "Bitcoin", code: "BTC", icon: "₿" }
];

const $ = (selector) => document.querySelector(selector);
const transactionList = $("#transaction-list");
const searchInput = $("#transaction-search");
const categoryFilter = $("#category-filter");
const transactionForm = $("#transaction-form");
const feedback = $("#transaction-feedback");
const authScreen = $("#auth-screen");
const appShell = $("#app-shell");
let transactions = [];
let currentUser = null;
let currentSession = null;
let sessionRefreshTimer = null;

function userStorageKey(key) {
  if (!currentUser?.id) throw new Error("É necessário entrar em uma conta para acessar as transações.");
  return `${key}:${currentUser.id}`;
}

// O conteúdo salvo é validado antes do uso para que dados incompletos não quebrem a tabela.
function loadLocalTransactions() {
  try {
    const saved = localStorage.getItem(userStorageKey(STORAGE_KEYS.transactions));
    if (saved === null) return [...sampleTransactions];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new TypeError("Formato de transações inválido.");
    return parsed.filter((item) =>
      item && typeof item.id === "string" &&
      typeof item.description === "string" &&
      (item.type === "entrada" || item.type === "saida") &&
      typeof item.date === "string" &&
      Number.isFinite(item.amount) && item.amount >= 0
    );
  } catch (error) {
    console.error("Não foi possível carregar as transações salvas.", error);
    return [...sampleTransactions];
  }
}

function saveLocalTransactions() {
  try {
    localStorage.setItem(userStorageKey(STORAGE_KEYS.transactions), JSON.stringify(transactions));
    return true;
  } catch (error) {
    console.error("Não foi possível salvar as transações.", error);
    showFeedback("Não foi possível salvar. Verifique o espaço disponível no navegador.", true);
    return false;
  }
}

function isSupabaseConfigured() {
  try {
    return new URL(SUPABASE_URL).protocol === "https:" && Boolean(SUPABASE_ANON_KEY.trim());
  } catch {
    return false;
  }
}

function showAuthFeedback(message, isError = false) {
  const status = $("#auth-feedback");
  status.textContent = message;
  status.classList.toggle("error", isError);
  status.hidden = false;
}

function setAuthMode(mode) {
  const isRegister = mode === "register";
  $("#login-form").hidden = isRegister;
  $("#register-form").hidden = !isRegister;
  $("#auth-login-tab").classList.toggle("active", !isRegister);
  $("#auth-register-tab").classList.toggle("active", isRegister);
  $("#auth-login-tab").setAttribute("aria-selected", String(!isRegister));
  $("#auth-register-tab").setAttribute("aria-selected", String(isRegister));
  $("#auth-title").textContent = isRegister ? "Crie sua conta" : "Acesse sua conta";
  $("#auth-intro").textContent = isRegister
    ? "Cadastre-se para organizar suas finanças."
    : "Entre para acompanhar seu painel financeiro.";
  $("#auth-feedback").hidden = true;
}

async function supabaseRequest(path, { method = "POST", body, accessToken } = {}) {
  if (!isSupabaseConfigured()) {
    throw new Error("Configure a URL e a chave anon/public do Supabase em script.js.");
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const responseText = await response.text();
  let result = {};
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(`O Supabase retornou uma resposta inválida (HTTP ${response.status}).`);
    }
  }
  if (!response.ok) {
    throw new Error(result.msg || result.message || result.error_description || `Falha de autenticação (HTTP ${response.status}).`);
  }
  return result;
}

async function supabaseDataRequest(path, { method = "GET", body, prefer } = {}) {
  if (!isSupabaseConfigured() || !currentSession?.access_token) {
    throw new Error("É necessário entrar em uma conta Supabase para sincronizar as transações.");
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${currentSession.access_token}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const responseText = await response.text();
  let result = null;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(`O Supabase retornou uma resposta inválida (HTTP ${response.status}).`);
    }
  }
  if (!response.ok) {
    throw new Error(result?.message || result?.details || `Falha ao sincronizar transações (HTTP ${response.status}).`);
  }
  return result;
}

async function loadTransactions() {
  if (currentSession?.demo || !isSupabaseConfigured()) return loadLocalTransactions();
  const rows = await supabaseDataRequest(
    "transactions?select=id,description,type,date,amount&order=date.desc,created_at.desc"
  );
  if (!Array.isArray(rows)) throw new TypeError("O Supabase retornou uma lista de transações inválida.");
  return rows.map((row) => {
    const amount = Number(row.amount);
    if (
      typeof row.id !== "string" ||
      typeof row.description !== "string" ||
      (row.type !== "entrada" && row.type !== "saida") ||
      typeof row.date !== "string" ||
      !Number.isFinite(amount) || amount <= 0
    ) {
      throw new TypeError("O Supabase retornou uma transação inválida.");
    }
    return { id: row.id, description: row.description, type: row.type, date: row.date, amount };
  });
}

async function createTransaction(item) {
  if (currentSession?.demo || !isSupabaseConfigured()) {
    transactions.unshift(item);
    if (!saveLocalTransactions()) {
      transactions.shift();
      return false;
    }
    return true;
  }

  const rows = await supabaseDataRequest("transactions?select=id,description,type,date,amount", {
    method: "POST",
    prefer: "return=representation",
    body: [{
      description: item.description,
      type: item.type,
      date: item.date,
      amount: item.amount,
      user_id: currentUser.id
    }]
  });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("O Supabase não confirmou a criação da transação.");
  }
  transactions.unshift({ ...item, id: rows[0].id });
  return true;
}

async function deleteAllUserTransactions() {
  if (currentSession?.demo || !isSupabaseConfigured()) {
    const previousTransactions = transactions;
    transactions = [];
    if (!saveLocalTransactions()) {
      transactions = previousTransactions;
      return false;
    }
    return true;
  }

  await supabaseDataRequest("transactions?id=not.is.null", {
    method: "DELETE",
    prefer: "return=minimal"
  });
  transactions = [];
  return true;
}

function persistAuthSession(payload, fallbackUser) {
  const user = payload.user || fallbackUser;
  if (!payload.access_token || !payload.refresh_token || !user?.id) {
    throw new Error("O Supabase não retornou uma sessão válida para esta conta.");
  }
  const session = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600),
    user
  };
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  return session;
}

function loadDemoAccounts() {
  try {
    const saved = localStorage.getItem(DEMO_ACCOUNTS_KEY);
    if (saved === null) return [];
    const accounts = JSON.parse(saved);
    if (!Array.isArray(accounts)) throw new TypeError("Formato de contas demonstrativas inválido.");
    return accounts;
  } catch (error) {
    console.error("Não foi possível carregar as contas demonstrativas.", error);
    throw new Error("Não foi possível acessar as contas salvas neste navegador.");
  }
}

function saveDemoAccounts(accounts) {
  try {
    localStorage.setItem(DEMO_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (error) {
    console.error("Não foi possível salvar a conta demonstrativa.", error);
    throw new Error("Não foi possível salvar a conta neste navegador.");
  }
}

function randomSalt() {
  if (!globalThis.crypto?.getRandomValues) throw new Error("Este navegador não oferece suporte a cadastro seguro de demonstração.");
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, saltHex) {
  if (!globalThis.crypto?.subtle) throw new Error("Abra o FinPulse por HTTPS para criar uma conta de demonstração.");
  const salt = Uint8Array.from(saltHex.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, key, 256);
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hashesMatch(first, second) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  return difference === 0;
}

function makeDemoSession(account) {
  const session = {
    demo: true,
    user: {
      id: account.id,
      email: account.email,
      user_metadata: { full_name: account.name }
    }
  };
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  return session;
}

async function loginDemoAccount(email, password) {
  const normalizedEmail = email.trim().toLocaleLowerCase("pt-BR");
  const account = loadDemoAccounts().find((item) => item.email === normalizedEmail);
  if (!account) throw new Error("Não encontramos uma conta com este e-mail neste navegador.");
  if (!account.confirmed) throw new Error("Esta conta de demonstração não tem confirmação real por e-mail. Conecte o Supabase para usar cadastro e confirmação.");
  const passwordHash = await hashPassword(password, account.salt);
  if (!hashesMatch(passwordHash, account.passwordHash)) throw new Error("E-mail ou senha incorretos.");
  await openDashboard(makeDemoSession(account));
}

function scheduleSessionRefresh(session) {
  if (!session.refresh_token) return;
  window.clearTimeout(sessionRefreshTimer);
  const delay = Math.max(1000, session.expires_at * 1000 - Date.now() - 60_000);
  sessionRefreshTimer = window.setTimeout(async () => {
    if (!currentSession) return;
    try {
      const refreshed = await supabaseRequest("token?grant_type=refresh_token", {
        body: { refresh_token: currentSession.refresh_token }
      });
      currentSession = persistAuthSession(refreshed, currentUser);
      scheduleSessionRefresh(currentSession);
    } catch (error) {
      console.error("Não foi possível renovar a sessão do Supabase.", error);
      clearLocalSession();
      showAuthFeedback("Sua sessão expirou. Entre novamente para continuar.", true);
    }
  }, delay);
}

async function openDashboard(session) {
  currentSession = session;
  currentUser = session.user;
  let transactionLoadError = null;
  try {
    transactions = await loadTransactions();
  } catch (error) {
    console.error("Não foi possível carregar as transações.", error);
    transactionLoadError = error;
    transactions = [];
  }
  const userName = currentUser.user_metadata?.full_name || currentUser.email || "Conta FinPulse";
  $("#profile-name").textContent = userName;
  $("#profile-email").textContent = currentUser.email || "Conta pessoal";
  $("#profile-avatar").textContent = Array.from(userName.trim())[0]?.toLocaleUpperCase("pt-BR") || "F";
  authScreen.hidden = true;
  appShell.hidden = false;
  renderTransactions();
  $("#transaction-storage-label").textContent = currentSession.demo || !isSupabaseConfigured()
    ? "Dados salvos neste dispositivo "
    : "Dados sincronizados com sua conta Supabase ";
  if (transactionLoadError) {
    showFeedback("Não foi possível carregar as transações. Confira a tabela e as políticas RLS no Supabase.", true);
  }
  renderInvestmentChart();
  loadMarketQuotes();
  $("#today-date").textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric"
  }).format(new Date());
  $("#current-year").textContent = String(new Date().getFullYear());
  scheduleSessionRefresh(session);
}

function clearLocalSession() {
  window.clearTimeout(sessionRefreshTimer);
  currentSession = null;
  currentUser = null;
  transactions = [];
  appShell.hidden = true;
  authScreen.hidden = false;
  setAuthMode("login");
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch (error) {
    console.error("Não foi possível remover a sessão local.", error);
  }
}

async function initializeAuth() {
  $("#auth-footnote").textContent = isSupabaseConfigured()
    ? "Autenticação e transações sincronizadas com o Supabase."
    : "Supabase não configurado. Cadastro e confirmação por e-mail estão indisponíveis; o login demonstrativo não envia e-mails.";

  try {
    const saved = localStorage.getItem(AUTH_SESSION_KEY);
    if (!saved) return;
    let session = JSON.parse(saved);
    if (session.demo && session.user?.id) {
      await openDashboard(session);
      return;
    }
    if (!isSupabaseConfigured()) {
      localStorage.removeItem(AUTH_SESSION_KEY);
      return;
    }
    if (!session.user?.id || !session.refresh_token) throw new TypeError("Sessão local inválida.");
    if (session.expires_at * 1000 <= Date.now() + 60_000) {
      session = await supabaseRequest("token?grant_type=refresh_token", {
        body: { refresh_token: session.refresh_token }
      }).then((payload) => persistAuthSession(payload, session.user));
    }
    await openDashboard(session);
  } catch (error) {
    console.error("Não foi possível restaurar a sessão.", error);
    clearLocalSession();
    showAuthFeedback("Não foi possível restaurar sua sessão. Entre novamente.", true);
  }
}

$("#auth-login-tab").addEventListener("click", () => setAuthMode("login"));
$("#auth-register-tab").addEventListener("click", () => setAuthMode("register"));

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  submitButton.disabled = true;
  try {
    if (!isSupabaseConfigured()) {
      await loginDemoAccount(String(formData.get("email")), String(formData.get("password")));
      return;
    }
    const result = await supabaseRequest("token?grant_type=password", {
      body: { email: String(formData.get("email")).trim(), password: String(formData.get("password")) }
    });
    await openDashboard(persistAuthSession(result));
  } catch (error) {
    showAuthFeedback(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const name = String(formData.get("name")).trim();
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));
  const confirmation = String(formData.get("confirmPassword"));
  if (password !== confirmation) {
    showAuthFeedback("As senhas não conferem.", true);
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    if (!isSupabaseConfigured()) {
      throw new Error("Para cadastrar e enviar a confirmação real, primeiro conecte um projeto Supabase.");
    }
    const redirectTo = /^https?:$/.test(window.location.protocol) ? `signup?redirect_to=${encodeURIComponent(window.location.origin)}` : "signup";
    const result = await supabaseRequest(redirectTo, {
      body: { email, password, data: { full_name: name } }
    });
    if (result.access_token && result.refresh_token) {
      await openDashboard(persistAuthSession(result));
      return;
    }

    try {
      const session = await supabaseRequest("token?grant_type=password", {
        body: { email, password }
      });
      await openDashboard(persistAuthSession(session, result.user));
      return;
    } catch (loginError) {
      if (!loginError.message.toLocaleLowerCase("pt-BR").includes("email not confirmed")) throw loginError;
    }

    $("#login-form").elements.email.value = email;
    setAuthMode("login");
    showAuthFeedback("Conta criada. Confirme o e-mail enviado pelo Supabase; depois, entre com seu e-mail e senha.");
  } catch (error) {
    showAuthFeedback(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

async function logout() {
  let logoutError = null;
  try {
    if (currentSession?.access_token) {
      await supabaseRequest("logout", { accessToken: currentSession.access_token });
    }
  } catch (error) {
    logoutError = error;
    console.error("O Supabase não confirmou o encerramento remoto da sessão.", error);
  }
  clearLocalSession();
  showAuthFeedback(
    logoutError ? "Sessão encerrada neste dispositivo, mas o servidor não confirmou o logout." : "Você saiu da sua conta.",
    Boolean(logoutError)
  );
}

$("#sidebar-logout-button").addEventListener("click", logout);

// O botão sempre descreve o tema para o qual o usuário pode alternar.
function applyTheme(theme) {
  const light = theme === "light";
  document.body.classList.toggle("light-theme", light);
  $("#theme-label").textContent = light ? "Tema escuro" : "Tema claro";
  $("#theme-toggle").setAttribute("aria-label", light ? "Alternar para tema escuro" : "Alternar para tema claro");
  $(".theme-icon").textContent = light ? "☾" : "☼";
  $('meta[name="theme-color"]').content = light ? "#f4f7f6" : "#0b1016";
}

try {
  applyTheme(localStorage.getItem(STORAGE_KEYS.theme) === "light" ? "light" : "dark");
} catch (error) {
  console.error("Não foi possível ler a preferência de tema.", error);
  applyTheme("dark");
}

$("#theme-toggle").addEventListener("click", () => {
  const theme = document.body.classList.contains("light-theme") ? "dark" : "light";
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  } catch (error) {
    console.error("Não foi possível salvar a preferência de tema.", error);
  }
});

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return displayDate.format(new Date(year, month - 1, day));
}

// Texto do usuário é sempre criado com textContent, sem interpretar marcação HTML.
function renderTransactions() {
  const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");
  const type = categoryFilter.value;
  const rows = transactions
    .filter((item) => type === "todas" || item.type === type)
    .filter((item) => item.description.toLocaleLowerCase("pt-BR").includes(query))
    .sort((a, b) => b.date.localeCompare(a.date));

  transactionList.replaceChildren();
  for (const item of rows) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const name = document.createElement("span");
    const icon = document.createElement("span");
    const categoryCell = document.createElement("td");
    const category = document.createElement("span");
    const dateCell = document.createElement("td");
    const amountCell = document.createElement("td");

    name.className = "transaction-name";
    icon.className = "transaction-symbol";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = item.description.trim().charAt(0).toLocaleUpperCase("pt-BR");
    name.append(icon, document.createTextNode(item.description));
    nameCell.append(name);

    category.className = `category-pill ${item.type}`;
    category.textContent = item.type === "entrada" ? "Entrada" : "Saída";
    categoryCell.append(category);
    dateCell.textContent = formatDate(item.date);
    amountCell.className = `amount-cell ${item.type}`;
    amountCell.textContent = `${item.type === "entrada" ? "+" : "−"} ${brl.format(item.amount)}`;
    row.append(nameCell, categoryCell, dateCell, amountCell);
    transactionList.append(row);
  }

  $("#empty-transactions").hidden = rows.length > 0;
  $("#transaction-count").textContent = `${rows.length} ${rows.length === 1 ? "transação" : "transações"}`;
}

function showFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("error", isError);
  feedback.hidden = false;
}

searchInput.addEventListener("input", renderTransactions);
categoryFilter.addEventListener("change", renderTransactions);

$("#toggle-transaction-form").addEventListener("click", () => {
  const open = transactionForm.hidden;
  transactionForm.hidden = !open;
  $("#toggle-transaction-form").setAttribute("aria-expanded", String(open));
  feedback.hidden = true;
  if (open) {
    transactionForm.elements.date.value = dateDaysAgo(0);
    transactionForm.elements.description.focus();
  }
});

// A exclusão total pede confirmação e só atualiza a tela depois de persistir a lista vazia.
$("#delete-all-transactions").addEventListener("click", async (event) => {
  if (transactions.length === 0) {
    showFeedback("Não há transações para excluir.");
    return;
  }
  if (!window.confirm("Excluir todas as transações de entrada e saída? Esta ação não pode ser desfeita.")) return;

  const button = event.currentTarget;
  button.disabled = true;
  try {
    if (!await deleteAllUserTransactions()) return;
    renderTransactions();
    showFeedback("Todas as transações foram excluídas.");
  } catch (error) {
    console.error("Não foi possível excluir as transações.", error);
    showFeedback(error.message, true);
  } finally {
    button.disabled = false;
  }
});

// A nova transação só permanece na lista se também for gravada com sucesso.
transactionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(transactionForm);
  const description = String(data.get("description")).trim();
  const amount = Number(data.get("amount"));
  const type = String(data.get("type"));
  const date = String(data.get("date"));
  if (!description || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    showFeedback("Confira a descrição, o valor e a data informados.", true);
    return;
  }

  const item = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, description, amount, type, date };
  const submitButton = transactionForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    if (!await createTransaction(item)) return;
  } catch (error) {
    console.error("Não foi possível salvar a transação.", error);
    showFeedback(error.message, true);
    return;
  } finally {
    submitButton.disabled = false;
  }
  transactionForm.reset();
  transactionForm.hidden = true;
  $("#toggle-transaction-form").setAttribute("aria-expanded", "false");
  showFeedback("Transação adicionada com sucesso.");
  renderTransactions();
});

function calculateFutureValue(initial, monthly, months, rate) {
  let total = initial;
  for (let month = 0; month < months; month += 1) total = total * (1 + rate) + monthly;
  return total;
}

// Os juros são compostos mês a mês; a maior projeção vira a referência para a altura das barras.
function renderInvestmentChart(showValidation = false) {
  const form = $("#simulator-form");
  const initialValue = form.elements.initial.value;
  const monthlyValue = form.elements.monthly.value;
  const monthsValue = form.elements.months.value;
  const initial = Number(initialValue);
  const monthly = Number(monthlyValue);
  const months = Number(monthsValue);

  const isEmpty = initialValue === "" || monthlyValue === "" || monthsValue === "";
  if (
    isEmpty ||
    !form.checkValidity() ||
    !Number.isFinite(initial) ||
    !Number.isFinite(monthly) ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 600 ||
    initial < 0 ||
    monthly < 0
  ) {
    if (showValidation) form.reportValidity();
    const chart = $("#investment-chart");
    chart.replaceChildren();
    chart.setAttribute("aria-label", "Conservador: R$ 0,00. Equilibrado: R$ 0,00. Arrojado: R$ 0,00.");
    $("#chart-period").textContent = "Em 0 meses";

    for (const scenario of [
      { name: "Conservador", color: "conservative" },
      { name: "Equilibrado", color: "balanced" },
      { name: "Arrojado", color: "bold" }
    ]) {
      const column = document.createElement("div");
      const value = document.createElement("span");
      const track = document.createElement("div");
      const bar = document.createElement("div");
      const label = document.createElement("span");
      column.className = "scenario-column";
      value.className = "scenario-value";
      value.textContent = brl.format(0);
      track.className = "bar-track";
      bar.className = `chart-bar ${scenario.color}`;
      bar.style.height = "0";
      bar.setAttribute("aria-hidden", "true");
      label.className = "scenario-label";
      label.textContent = scenario.name;
      track.append(bar);
      column.append(value, track, label);
      chart.append(column);
    }
    return;
  }

  const scenarios = [
    { name: "Conservador", rate: 0.007, color: "conservative" },
    { name: "Equilibrado", rate: 0.01, color: "balanced" },
    { name: "Arrojado", rate: 0.013, color: "bold" }
  ].map((scenario) => ({ ...scenario, total: calculateFutureValue(initial, monthly, months, scenario.rate) }));
  const maxTotal = Math.max(1, ...scenarios.map((scenario) => scenario.total));
  const chart = $("#investment-chart");
  chart.replaceChildren();
  chart.setAttribute("aria-label", scenarios.map((scenario) => `${scenario.name}: ${brl.format(scenario.total)}`).join(". "));
  $("#chart-period").textContent = `Em ${months} ${months === 1 ? "mês" : "meses"}`;

  for (const scenario of scenarios) {
    const column = document.createElement("div");
    const value = document.createElement("span");
    const track = document.createElement("div");
    const bar = document.createElement("div");
    const label = document.createElement("span");
    column.className = "scenario-column";
    value.className = "scenario-value";
    value.textContent = brl.format(scenario.total);
    track.className = "bar-track";
    bar.className = `chart-bar ${scenario.color}`;
    bar.style.height = scenario.total === 0
      ? "0"
      : `${Math.max(5, scenario.total / maxTotal * 100)}%`;
    bar.setAttribute("aria-hidden", "true");
    label.className = "scenario-label";
    label.textContent = scenario.name;
    track.append(bar);
    column.append(value, track, label);
    chart.append(column);
  }
}

$("#simulator-form").addEventListener("submit", (event) => {
  event.preventDefault();
  renderInvestmentChart(true);
});
$("#simulator-form").addEventListener("input", (event) => {
  if (event.target.matches("input")) renderInvestmentChart();
});

function quotePrice(quote, code) {
  const value = Number(quote.bid);
  if (!Number.isFinite(value)) throw new TypeError(`Cotação inválida para ${code}.`);
  const decimals = code === "BTC" ? 0 : 2;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: decimals, maximumFractionDigits: decimals
  }).format(value);
}

// A API fornece valores e variação; a interface é montada com elementos nativos, sem bibliotecas.
function renderMarketCards(quotes) {
  const grid = $("#market-grid");
  grid.replaceChildren();
  for (const currency of currencies) {
    const quote = quotes[currency.key];
    const change = Number(quote.pctChange);
    if (!Number.isFinite(change)) throw new TypeError(`Variação inválida para ${currency.code}.`);
    const card = document.createElement("article");
    const top = document.createElement("div");
    const icon = document.createElement("span");
    const name = document.createElement("span");
    const title = document.createElement("strong");
    const code = document.createElement("small");
    const price = document.createElement("strong");
    const movement = document.createElement("span");
    card.className = "market-card";
    top.className = "market-card-top";
    icon.className = "currency-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = currency.icon;
    name.className = "currency-name";
    title.textContent = currency.name;
    code.textContent = currency.code;
    name.append(title, code);
    top.append(icon, name);
    price.className = "market-price";
    price.textContent = quotePrice(quote, currency.code);
    const direction = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
    movement.className = `market-change ${direction}`;
    movement.textContent = `${change > 0 ? "↑" : change < 0 ? "↓" : "→"} ${Math.abs(change).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% hoje`;
    card.append(top, price, movement);
    grid.append(card);
  }
}

async function loadMarketQuotes() {
  const endpoint = "https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL";
  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Resposta HTTP ${response.status}`);
    const quotes = await response.json();
    if (!currencies.every((currency) => quotes && quotes[currency.key])) {
      throw new TypeError("A resposta não contém todas as cotações esperadas.");
    }
    renderMarketCards(quotes);
    $("#market-updated").textContent = `Atualizado às ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
  } catch (error) {
    console.error("Não foi possível carregar as cotações do mercado.", error);
    const message = document.createElement("p");
    message.className = "market-error";
    message.setAttribute("role", "status");
    message.textContent = "Não foi possível carregar as cotações agora. Verifique sua conexão e atualize a página para tentar novamente.";
    $("#market-grid").replaceChildren(message);
    $("#market-updated").textContent = "Cotações indisponíveis";
  }
}

setAuthMode("login");
initializeAuth();
