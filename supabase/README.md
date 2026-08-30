# データベース

Supabase プロジェクト: `DecisionMaking` (`louyefofmcxwkxypyzjv`, ap-northeast-2)

`migrations/` の3本を順に適用すると、本番と同じ状態になります。適用済みです。

| ファイル | 内容 |
|---|---|
| `0001_core.sql` | 全テーブル |
| `0002_rls.sql` | 行レベルセキュリティ、プロフィール自動作成 |
| `0003_align_with_app_types.sql` | 列構成を実装済みの型に合わせる |

## 確認できていること

- 22テーブル、すべて RLS 有効
- 追記のみのテーブル(回答・履歴・監査・予測・行動イベント等)は
  `update` / `delete` のポリシーを作っていない。RLS 下ではポリシーの無い操作は
  拒否されるので、INV-01「決断の履歴は改変できない」が DB の権限として成立する
- 確定済み version は `committed_at is null` の条件で更新・削除ともに不可

## スキーマとアプリのズレの検出

`tests/fixtures/schema.json` に実 DB の列一覧を置き、`tests/schema.test.ts` が
「アプリが送ろうとする列がすべて実在するか」を検証します。
マイグレーションを足したら、次の SQL の結果で fixture を更新してください。

```sql
select json_object_agg(table_name, cols) from (
  select table_name, string_agg(column_name, ',' order by ordinal_position) as cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name not in ('profiles','usage_periods','ai_calls')
  group by table_name
) t;
```
