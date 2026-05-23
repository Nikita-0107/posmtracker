-- Secure Supabase Realtime broadcast/presence channels.
-- The app only uses postgres_changes subscriptions, which are gated by the
-- underlying table RLS (already scoped per WSP/WD/TL/user). The realtime.messages
-- table governs Broadcast & Presence topic access, which the app does not use.
-- We deny all broadcast/presence access by default so no authenticated user can
-- subscribe to arbitrary topics and receive other users' events.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny broadcast and presence by default" ON realtime.messages;

CREATE POLICY "Deny broadcast and presence by default"
ON realtime.messages
FOR SELECT
TO authenticated
USING (false);

DROP POLICY IF EXISTS "Deny broadcast and presence writes" ON realtime.messages;

CREATE POLICY "Deny broadcast and presence writes"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (false);