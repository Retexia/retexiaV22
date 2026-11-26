import "server-only";

import { createAdminClient } from "@retexia/supabase/admin";
import { dispatchPush as send } from "@retexia/supabase/push";

/** App push notifications (see packages/supabase/src/push.ts). */
export const dispatchPush = (limit = 50) => send(createAdminClient(), limit);
