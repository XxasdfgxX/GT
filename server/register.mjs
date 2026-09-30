/** Lets Node load the game's extensionless TypeScript imports. */

import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
