"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/avatar";
import { Notice } from "@/components/ui";

/** Shrinks a photo to at most 512 px and re-saves it as JPEG, so uploads stay small and fast. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("convert"))), "image/jpeg", 0.85));
}

export default function AvatarUploader({ userId, name, url }: { userId: string; name: string; url: string | null }) {
  const supabase = createClient();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const folderPath = (u: string | null) => (u ? decodeURIComponent(u.split("/avatars/")[1] ?? "").split("?")[0] : "");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setMsg({ ok: false, text: "Choose a JPG, PNG or WebP photo." }); return; }
    setBusy(true); setMsg(null);
    try {
      const blob = await shrink(file);
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const up = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw new Error(up.error.message);
      const publicUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const upd = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId).select("id");
      if (upd.error || !upd.data?.length) throw new Error(upd.error?.message ?? "Could not save the photo link");
      const old = folderPath(url);
      if (old && old.startsWith(userId + "/")) await supabase.storage.from("avatars").remove([old]);
      setMsg({ ok: true, text: "Photo updated." });
      router.refresh();
    } catch (err) {
      const m = (err as Error).message;
      setMsg({ ok: false, text: /bucket|not found|avatar_url|column/i.test(m) ? "The photo feature is not set up yet. Ask your admin to run database update 0006." : m });
    } finally { setBusy(false); }
  }

  async function onRemove() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
    const old = folderPath(url);
    if (!error && old.startsWith(userId + "/")) await supabase.storage.from("avatars").remove([old]);
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message }); else { setMsg({ ok: true, text: "Photo removed." }); router.refresh(); }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar url={url} name={name} size={84} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary !min-h-9 !px-3" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Working…" : url ? "Change photo" : "Add photo"}</button>
          {url && <button className="btn-secondary !min-h-9 !px-3 !text-red-700" disabled={busy} onClick={onRemove}>Remove</button>}
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPick} />
        </div>
        {msg && <Notice kind={msg.ok ? "ok" : "error"}>{msg.text}</Notice>}
      </div>
    </div>
  );
}
