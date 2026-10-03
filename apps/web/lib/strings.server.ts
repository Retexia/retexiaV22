import "server-only";

import { getStrings } from "./content";
import { makeT } from "./strings";

export async function getT() {
  return makeT(await getStrings());
}
