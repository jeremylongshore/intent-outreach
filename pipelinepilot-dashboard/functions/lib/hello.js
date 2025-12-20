import { onRequest } from "firebase-functions/v2/https";
export const hello = onRequest((_, res) => {
    res.json({ ok: true, ts: Date.now() });
});
