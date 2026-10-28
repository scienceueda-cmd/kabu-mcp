# kabu-mcp

Finnhubの株価データをClaudeから使うための、自分専用のリモートMCPサーバーです。Netlify Functionsで動きます。

## ツール
| ツール | 中身 |
|---|---|
| `get_quotes` | 最大10銘柄の現在値・前日比・%・始値/高値/安値・前日終値・時刻（JST） |
| `get_company_news` | 銘柄のニュース見出し（直近1〜14日） |
| `get_earnings_calendar` | 決算日・EPS/売上の予想と実績（`amc`は米国の引け後＝日本では翌朝） |
| `get_market_status` | 米国市場が今開いているか（プレ・通常・アフター）、休場日 |

すべて読み取り専用です。売買の機能はありません。

## セットアップ
1. **Finnhubの無料APIキー**を finnhub.io で発行する
2. **Netlifyにデプロイ**する（このフォルダをGitHubにpushしてNetlifyにつなぐか、`netlify deploy --build --prod`）
3. Netlifyの環境変数（どちらもSecretにする）
   - `FINNHUB_API_KEY` = FinnhubのAPIキー
   - `MCP_PATH_SECRET` = `openssl rand -hex 32` で作ったランダムな文字列（24文字以上ないと起動しない）
4. 環境変数を入れたあとに再デプロイする
5. **Claudeのカスタムコネクタ**に次のURLを登録する
   `https://<サイト名>.netlify.app/mcp/<MCP_PATH_SECRET>`

### セキュリティ
- claude.aiのカスタムコネクタは固定のAuthorizationヘッダーを送れません。そのため、秘密の文字列をURLのパスに入れて認証しています。**このURLはパスワードと同じ扱い**にして、人に見せないこと。
- 秘密の文字列が間違っていたら404を返すので、サーバーがあること自体が外から分かりにくくなっています。
- URLが漏れたら、`MCP_PATH_SECRET` を作り直して再デプロイし、コネクタを登録し直してください。
- Claude Codeなどからは `Authorization: Bearer <MCP_PATH_SECRET>` ヘッダーと `/mcp` でも接続できます。
- 1分あたり60リクエストまでに制限しています（Finnhub無料枠の目安と同じ）。

## 開発
```bash
npm install
npm test          # Finnhubをモックにしたスモークテスト
npm run typecheck
netlify dev       # http://localhost:8888/mcp/<secret>
```

## 注意
- Finnhub無料枠のデータの細かさや遅延はプランによって変わります。くわしくはFinnhubのサイトで確認してください。
- 一部のエンドポイントは有料プランでしか使えないことがあります。その場合、ツールはエラーメッセージ（403）を返します。

## ライセンス

ポートフォリオとして公開しています。ライセンスは付けていないため、コードの転用・再配布はご遠慮ください。
