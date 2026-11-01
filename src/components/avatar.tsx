/* A round profile photo, or the person's initial when there is no photo. */
export default function Avatar({ url, name, size = 36 }: { url?: string | null; name: string; size?: number }) {
  const style = { width: size, height: size };
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={style} className="shrink-0 rounded-full border border-black/10 object-cover" />
  ) : (
    <span style={{ ...style, fontSize: size * 0.42 }} className="grid shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand" aria-hidden>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
