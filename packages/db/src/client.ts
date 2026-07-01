// Cliente Postgres único do sistema — usa o driver nativo do Bun (sem `pg`/ORM).
// Toda leitura/escrita no banco passa por este pool; configuração vem de `@sirvase/config`.
import { SQL } from "bun";
import { settings } from "@sirvase/config";

export const sql = new SQL({
  hostname: settings.postgres.host,
  port: settings.postgres.port,
  database: settings.postgres.database,
  username: settings.postgres.user,
  password: settings.postgres.password,
  max: settings.postgres.poolMax
});
