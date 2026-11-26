import { useState } from "react";
import { Alert as RNAlert } from "react-native";
import { Screen } from "@/components/screen";
import { Alert, Button, Card, Field, Input, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { keys, useAction, useMe } from "@/lib/queries";

/** Delete my account (Google Play and Apple require it in the app): a request the Retexia team carries out. */
export default function DeleteAccount() {
  const me = useMe();
  const [reason, setReason] = useState("");
  const pending = me.data?.deletionRequestedAt;
  const request = useAction(() => api<{ message: string | null }>("/account/deletion", { method: "POST", body: { reason: reason.trim() || null } }), { invalidate: [keys.me] });
  const cancel = useAction(() => api<{ message: string | null }>("/account/deletion", { method: "DELETE" }), { invalidate: [keys.me] });
  return (
    <Screen>
      {pending ? (
        <Alert
          tone="warning"
          title="Your account will be deleted"
          action={<Button title="Keep my account" variant="secondary" loading={cancel.isPending} onPress={() => cancel.mutate()} />}
        >
          {`You asked on ${new Date(pending).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. We'll email you when it's done. Until then you can change your mind.`}
        </Alert>
      ) : (
        <Card>
          <Txt variant="h2">Delete your Retexia account</Txt>
          <Txt color="inkMuted">
            The Retexia team deletes your account and everything in it: your profile, requests, receipts and your products&apos; data (chats, orders, posts, goals). Your products stop working. You can change your mind until it&apos;s done.
          </Txt>
          <Field label="Why are you leaving?" hint="Optional. Helps us do better.">
            <Input value={reason} onChangeText={setReason} multiline numberOfLines={3} maxLength={1000} style={{ minHeight: 88 }} />
          </Field>
          <Button
            title="Delete my account"
            variant="danger"
            loading={request.isPending}
            onPress={() =>
              RNAlert.alert("Delete your account?", "Everything in your Retexia account will be deleted. This can't be undone once we've done it.", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => request.mutate() },
              ])
            }
          />
        </Card>
      )}
    </Screen>
  );
}
