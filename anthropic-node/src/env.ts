// Load the shared .env at the repo root, whatever the working directory.
import { config } from "dotenv";

config({ path: new URL("../../.env", import.meta.url) });
