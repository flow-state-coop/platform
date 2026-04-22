import { tmpdir } from "node:os";
import { join } from "node:path";

export const FIXTURE_FILE = join(tmpdir(), "platform-e2e-fixture.json");
