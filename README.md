# FinPulse Analytics

FinPulse Analytics é uma dashboard financeira responsiva para acompanhar cotacoes, organizar transacoes e simular o crescimento de investimentos.

O projeto foi desenvolvido com HTML, CSS e JavaScript puro, sem framework ou etapa de compilacao. Ele pode ser executado diretamente em um servidor local e publicado em qualquer hospedagem de arquivos estaticos.

## Funcionalidades

- Cadastro, login e encerramento de sessao com Supabase.
- Conta demonstrativa no navegador quando o Supabase nao esta configurado.
- Restauracao da sessao ao recarregar a pagina.
- Renovacao automatica de sessoes autenticadas pelo Supabase.
- Cotacoes em tempo real de dolar, euro e bitcoin.
- Simulador de investimentos com juros compostos em tres cenarios:
  - Conservador: 0,7% ao mes.
  - Equilibrado: 1,0% ao mes.
  - Arrojado: 1,3% ao mes.
- Atualizacao automatica da projeção quando os campos do simulador mudam.
- Estado vazio com valores e barras zerados quando os campos sao apagados ou invalidos.
- Cadastro de entradas e saidas.
- Busca de transacoes por descricao.
- Filtro por entrada ou saida.
- Exclusao individual e exclusao de todas as transacoes.
- Armazenamento local separado por usuario.
- Sincronizacao de transacoes pelo Supabase quando a conta esta autenticada.
- Temas claro e escuro.
- Interface adaptada para computador, tablet e celular.

## Como o site funciona

### Autenticacao

Ao acessar o site, a tela de acesso oferece as opcoes Entrar e Criar conta.

Com o Supabase configurado, o login usa a API de autenticacao do projeto e a conta pode ser criada com confirmacao por e-mail. O token de acesso e o token de atualizacao ficam armazenados no navegador. O token de atualizacao e usado para renovar a sessao em segundo plano.

Ao sair, a sessao remota e a sessao salva no navegador sao encerradas e o usuario volta para a tela de autenticacao.

O projeto tambem possui modo demonstrativo. Nesse modo, os dados ficam no `localStorage` e sao separados pelo identificador da conta. Cadastro demonstrativo exige Supabase; para usar confirmacao real por e-mail, o projeto deve estar conectado.

### Transacoes

Cada usuario pode adicionar transacoes com:

- Descricao.
- Valor.
- Tipo de entrada ou saida.
- Data.

Sem Supabase, ou em conta demonstrativa, as transacoes ficam no navegador. Com Supabase, as informacoes sao enviadas para a tabela `transactions` e protegidas pelas politicas RLS configuradas no arquivo `supabase.sql`.

A tabela permite:

- Buscar pelo texto da descricao.
- Filtrar entradas e saidas.
- Excluir uma transacao.
- Excluir todas as transacoes do usuario.

### Cotacoes

As cotacoes sao obtidas da AwesomeAPI no seguinte endereco:

`https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL`

O dashboard mostra:

- Dolar americano.
- Euro.
- Bitcoin.
- Valor em reais.
- Variacao percentual.

Enquanto os dados carregam, os cartoes exibem skeletons. Se a API estiver indisponivel, uma mensagem de erro aparece no painel.

### Simulador de investimentos

O calculo utiliza juros compostos mes a mes:

```text
patrimonio = patrimonio * (1 + taxa_mensal) + aporte_mensal
```

Os campos disponiveis sao:

- Aporte inicial.
- Aporte mensal.
- Prazo em meses, de 1 a 600.

Cada cenarios usa uma taxa mensal diferente. Os resultados sao atualizados ao alterar os campos.

Ao apagar ou invalidar qualquer campo, a projeção mostra R$ 0,00 em todos os cenarios, remove a altura das barras e informa um periodo de 0 meses.

Este simulador e uma ferramenta educacional. Ele nao considera impostos, taxas, inflacao ou garantias de rentabilidade.

### Temas

O tema escolhido pode ser claro ou escuro. No escritorio, o tema atual e identificado pelo botao do cabecalho. A preferencia pode ser aplicada pela funcao `applyTheme` no JavaScript.

## Estrutura do projeto

```text
index.html       Estrutura da pagina e componentes da interface
style.css        Layout, componentes, responsividade e temas
script.js        Autenticacao, dados, cotacoes e simulador
supabase.sql     Estrutura da tabela e politicas de seguranca
README.md        Documentacao do projeto
```

## Executando localmente

Nao e necessario instalar pacotes ou executar um processo de build.

Como a aplicacao faz requisicoes HTTP, recomenda-se abrir o projeto por um servidor local. Com a extensao Live Server no VS Code:

1. Abra a pasta do projeto.
2. Clique com o botao direito em `index.html`.
3. Selecione **Open with Live Server**.

Alternativa com Python:

```bash
python -m http.server 5500
```

Depois, acesse `http://localhost:5500`.

## Configurando o Supabase

1. Crie um projeto no Supabase.
2. Abra o **SQL Editor**.
3. Execute o conteudo de `supabase.sql`.
4. Em **Authentication > Providers**, mantenha o provedor E-mail ativo.
5. Em **Authentication > URL Configuration**, configure a URL do site e adicione os dominios permitidos.
6. Em `script.js`, substitua:

```javascript
const SUPABASE_URL = "sua-url-do-projeto";
const SUPABASE_ANON_KEY = "sua-chave-anon-public";
```

Use apenas a chave publica `anon/publishable` no navegador. Nunca utilize a chave `service_role` no codigo do frontend.

Depois de configurar o projeto:

- O cadastro envia o fluxo de confirmacao do Supabase.
- O login cria uma sessao real.
- As transacoes sao sincronizadas com o banco.
- A tabela usa RLS para impedir que um usuario acesse registros de outro usuario.

## Dados armazenados no navegador

O projeto utiliza as seguintes categorias de dados locais:

- `finpulse-supabase-session`: sessao autenticada ou sessao demonstrativa.
- `finpulse-demo-accounts`: contas demonstrativas cadastradas no navegador.
- `finpulse-transactions:<id-do-usuario>`: transacoes locais por usuario.
- `finpulse-theme`: preferencia de tema.

Limpar os dados do site no navegador remove contas, sessoes e transacoes locais.

## Publicacao

Como os arquivos sao estaticos, o projeto pode ser publicado na Vercel, Netlify, GitHub Pages ou em qualquer servidor web.

Ao publicar, configure o Supabase com:

- URL exata do ambiente publicado.
- URL local, se for utilizar desenvolvimento local.
- Redirect URLs permitidas para confirmacao de cadastro.

A pasta `.vercel/output/static` pode conter uma copia de build ou artefatos anteriores. Para publicar uma versao atualizada, considere a implantacao pelo diretorio raiz do projeto ou limpe a copia publica antiga antes do deploy.

## Tecnologias

- HTML5.
- CSS3.
- JavaScript moderno.
- Supabase Auth.
- Supabase Postgres.
- AwesomeAPI.
- Intl API para valores e datas em portugues.
