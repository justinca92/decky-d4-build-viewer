// InfinityBuilds build page → compact build data. Ported from the QAM mockup (tested on warlock, necromancer,
// rogue and sorcerer builds). The page embeds the whole build in its Next.js RSC payload (self.__next_f).

export type Lang = "ko" | "en";

export interface Gear { slot: string; kind: string; id: string; name: string; asp?: string; mw?: number; sockets: string[]; aff: any[] }
export interface PathStep { id: string; n: number; r?: 1 }
export interface Variant {
  name: string; skills: string[]; runes: string[]; mechanic: string; gear: Gear[];
  boards: any[]; glyphs: Record<string, string>; path: PathStep[];
  merc: { hired?: string; re?: string; skill?: string; trig?: string; trigSkill?: string };
  prime?: string; seal: string; charms: string[];
}
export interface BuildData {
  title: string; cls: string; season: string; activity: string[]; strengths: string[]; author: string;
  updated: string; tracking: number; slug: string; variants: Variant[];
}
export interface Names { map: Record<string, string>; sk: Record<string, [string, string, string]>; icons: Record<string, string>; mech: Record<string, string>; total: number }
export interface NoteCard { title: string; items?: string[]; steps?: string[]; tip?: string }
export type Notes = Record<string, NoteCard>[];
export interface IconSrc { url: string; uv?: number[]; aw?: number; ah?: number }
export interface Parsed { raw: any; data: BuildData; notes: Notes; itemIcons: Record<string, IconSrc>; skillIcons: Record<string, string> }
// reduced dataset index built by the backend (main.py _build_index)
export interface DatasetIndex { version: string; labels: Record<string, string>; setMembers: Record<string, string>; setNames?: Record<string, string>; nodes: [string, string, string][]; layouts: Record<string, [string, string, string, string][]> }

export const ASSETS = "https://assets.infinitybuilds.gg";

function rscPayload(html: string): string {
  let s = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) s += JSON.parse(m[1]);
  return s;
}

function objectAt(s: string, start: number): any {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "{") depth++; else if (c === "}" && --depth === 0) return JSON.parse(s.slice(start, i + 1));
  }
  throw new Error("build object not closed");
}

// "$5e" style values point at "5e:T<hex byte length>," text chunks
function resolver(s: string) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  return (v: any): string => {
    if (typeof v !== "string" || !/^\$[0-9a-f]+$/.test(v)) return v || "";
    const m = new RegExp("(?:^|[^0-9a-f])" + v.slice(1) + ":T([0-9a-f]+),").exec(s);
    if (!m) return "";
    const n = parseInt(m[1], 16), start = m.index + m[0].length;
    return dec.decode(enc.encode(s.slice(start, start + n)).slice(0, n));
  };
}

// author HTML → card lines; @mentions become chips ({m:…} mythic, {u:…} unique, {l:…} legendary/set, {r:…} rune/gem, {s:…} skill)
function htmlToLines(html: string): string[] | null {
  if (!html || !/\S/.test(html.replace(/<[^>]+>/g, ""))) return null;
  const doc = new DOMParser().parseFromString(`<div>${html.replace(/<br\s*\/?>/gi, "\n")}</div>`, "text/html");
  // chip token keeps what localizeNotes needs later: {k:label§kind§entityId}
  doc.querySelectorAll("a[class*=mention], span[class*=mention]").forEach(a => {
    if (a.closest("[class*=mention] [class*=mention]")) return;
    const c = a.className, kind = a.getAttribute("data-kind") || "";
    const k = kind === "skill" ? "s" : /mythic/.test(c) ? "m" : /unique/.test(c) ? "u" : /legendary|set/.test(c) ? "l" : /magic|rare|rune|gem|splinter/.test(c) ? "r" : "s";
    const clean = (x: string) => x.replace(/^@/, "").replace(/[{}§]/g, "").trim();
    const label = clean(a.getAttribute("data-label") || a.textContent || "");
    const id = clean(a.getAttribute("data-entity-id") || "");
    a.replaceWith(doc.createTextNode(label ? `{${k}:${label}§${kind}§${id}}` : ""));
  });
  doc.querySelectorAll("img, span[style*=background-image]").forEach(x => x.remove());
  const lines: string[] = [];
  const walk = (el: Element) => {
    for (const ch of Array.from(el.children)) {
      if (/^(UL|OL|DIV|BLOCKQUOTE)$/.test(ch.tagName)) { walk(ch); continue; }
      (ch.textContent || "").split(/\n+/).map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean).forEach(x => lines.push(x));
    }
  };
  const root = doc.body.firstElementChild;
  if (root) walk(root);
  if (!lines.length) { const all = (doc.body.textContent || "").replace(/\s+/g, " ").trim(); if (all) lines.push(all); }
  return lines.length ? lines.slice(0, 40) : null;
}

function compact(b: any): BuildData {
  return {
    title: String(b.title || "").trim(), cls: b.classId, season: String(b.season ?? ""), activity: b.activity || [], strengths: b.strengths || [],
    author: b.authorName || "", updated: String(b.updatedAt || "").slice(0, 10), tracking: b.favoriteCount || 0, slug: b.shareSlug,
    variants: (b.variants || []).map((v: any): Variant => {
      const path: PathStep[] = [];
      for (const id of (v.skills?.levelingPath || []).map((x: string) => x.split("::skill-")[1])) {
        const last = path[path.length - 1];
        if (last && last.id === id) last.n++; else path.push({ id, n: 1 });
      }
      const fin = new Set(Object.keys(v.skills?.skills || {}).map(x => x.split("::skill-")[1]));
      path.forEach(p => { if (!fin.has(p.id)) p.r = 1; });
      const glyphs: Record<string, string> = {};
      for (const [node, g] of Object.entries(v.paragon?.glyphs || {})) glyphs[node.split("::").slice(0, 2).join("::")] = g as string;
      return {
        name: v.name, skills: v.skillIcons || [], runes: (v.paperdollRunes || []).filter(Boolean), mechanic: v.mechanic ? JSON.stringify(v.mechanic) : "",
        gear: (v.gear || []).map((g: any) => ({
          slot: g.slot, kind: g.kind, id: g.itemId, name: g.itemName, asp: g.aspectId, mw: g.masterworkLevel, sockets: (g.sockets || []).filter(Boolean),
          aff: (g.affixes || []).filter((a: any) => !a.removed).flatMap((a: any) => [a.affixId, a.value,
            (a.tempered ? "T" : "") + (a.greater ? "G" : "") + (a.transfigured ? "X" : "") + (a.affixId === g.masterworkFinalAffixId ? "M" : "")])
        })),
        boards: (v.paragon?.slots || []).flatMap((x: any) => [x.boardId, x.rotation]), glyphs, path,
        merc: { hired: v.mercenary?.hired, re: v.mercenary?.reinforcement, skill: v.mercenary?.reinforcementSkill, trig: v.mercenary?.reinforcementTrigger, trigSkill: v.mercenary?.reinforcementTriggerSkill },
        prime: v.primeEvil?.choice, seal: v.talisman?.seal || "", charms: (v.talisman?.charms || []).filter(Boolean)
      };
    })
  };
}

function authorNotes(b: any, R: (v: any) => string, lang: Lang): Notes {
  const T = (ko: string, en: string) => lang === "en" ? en : ko;
  const vg = b.snapshot?.meta?.variantGuides || {};
  return (b.variants || []).map((v: any) => {
    const g = vg[v.id] || {}, out: Record<string, NoteCard> = {};
    const add = (key: string, title: string, html: any) => { const lines = htmlToLines(R(html)); if (lines) out[key] = { title, items: lines }; };
    add("overview", T("작성자 설명", "Author notes"), g.guide);
    add("rotation", g.skillRotationTitle || T("스킬 로테이션", "Skill rotation"), g.skillRotation);
    add("gear", g.notesTitle || T("장비 메모", "Gear notes"), g.notes);
    add("tree", T("스킬 트리 메모", "Skill tree notes"), g.skillTree);
    add("paragon", T("정복자 메모", "Paragon notes"), g.paragon);
    add("talisman", T("부적 메모", "Talisman notes"), v.talisman?.notes);
    add("etc", T("전쟁 계획", "War Plan"), v.warplan?.notes);
    return out;
  });
}

export function parseBuildPage(html: string, lang: Lang): Parsed {
  const s = rscPayload(html);
  const p = s.indexOf('{"build":{"id"');
  if (p < 0) throw new Error(lang === "en" ? "No build data found on the page" : "페이지에서 빌드 데이터를 찾지 못했습니다");
  const raw = objectAt(s, p).build;
  const data = compact(raw);
  const notes = authorNotes(raw, resolver(s), lang);
  const itemIcons: Record<string, IconSrc> = {}, skillIcons: Record<string, string> = {};
  for (const v of raw.variants || []) {
    for (const ic of v.skillIcons || []) if (ic) skillIcons[ic] = `${ASSETS}/assets/d4/assets/spell-images/${raw.classId}/${ic}__active_skill.webp`;
    for (const g of v.gear || []) if (g.itemId && !(g.itemId in itemIcons)) {
      const sp = g.iconSprite || {};
      if (g.iconUrl) itemIcons[g.itemId] = { url: ASSETS + g.iconUrl };
      else if (sp.atlas && [sp.u0, sp.v0, sp.u1, sp.v1].every((x: any) => typeof x === "number"))
        itemIcons[g.itemId] = { url: `${ASSETS}/assets/d4/atlases/${sp.atlas}.webp`, uv: [sp.u0, sp.v0, sp.u1, sp.v1], aw: sp.atlasWidth, ah: sp.atlasHeight };
    }
  }
  return { raw, data, notes, itemIcons, skillIcons };
}

// expansion ultimates use x1_* icon ids that don't match the power's source id
const X1_ALIAS: Record<string, string> = { necromancer_ultimate4: "Necromancer_BloodWave.pow" };

export function nameMap(b: any, ds: DatasetIndex): Names {
  const norm = (id: string) => id.replace(/^(item|aspect|affix)-\d+-/, "$1-");
  const lookup = (id: string) => ds.labels[id] || ds.labels[norm(id)] || ds.setMembers[id];
  const map: Record<string, string> = {}, ids = new Set<string>();
  for (const v of b.variants || []) {
    for (const g of v.gear || []) { ids.add(g.itemId); if (g.aspectId) ids.add(g.aspectId); (g.sockets || []).forEach((x: string) => x && ids.add(x)); (g.affixes || []).forEach((a: any) => ids.add(a.affixId)); }
    (v.paperdollRunes || []).forEach((x: string) => x && ids.add(x));
    (v.paragon?.slots || []).forEach((x: any) => x.boardId && ids.add(x.boardId));
    Object.values(v.paragon?.glyphs || {}).forEach((x: any) => ids.add(x));
    if (v.talisman?.seal) ids.add(v.talisman.seal);
    (v.talisman?.charms || []).forEach((x: string) => x && ids.add(x));
  }
  ids.delete(undefined as any);
  for (const id of ids) { if (!id) continue; const l = lookup(id); if (l) map[id] = l; }

  const cls = b.classId;
  const bySource = new Map<string, string>(ds.nodes.map(n => [n[0].toLowerCase(), n[2]]));
  const layout = new Map<string, [string, string, string, string]>((ds.layouts[cls] || []).map(n => [n[0], n]));
  const sk: Record<string, [string, string, string]> = {};
  // every node in the point order too: some are taken while leveling and refunded later
  for (const v of b.variants || []) for (const k of new Set<string>([...Object.keys(v.skills?.skills || {}), ...(v.skills?.levelingPath || [])])) {
    const n = layout.get(k), num = k.split("::skill-")[1];
    if (!n) continue;
    const base = n[1] ? bySource.get((n[1] + ".pow").toLowerCase()) : undefined;
    sk[num] = [base || n[3] || n[1] || "#" + num, n[2], n[3]];
  }
  const clsNodes = ds.nodes.filter(n => n[1] === cls), icons: Record<string, string> = {};
  const wanted = new Set<string>();
  for (const v of b.variants || []) { (v.skillIcons || []).forEach((x: string) => x && wanted.add(x)); if (v.mercenary?.reinforcementTriggerSkill) wanted.add(v.mercenary.reinforcementTriggerSkill); }
  for (const ic of wanted) {
    const key = ic.replace(/_/g, "").toLowerCase();
    const alias = X1_ALIAS[ic.replace(/^x1_/, "")];
    const hit = (alias && bySource.get(alias.toLowerCase()))
      || clsNodes.find(n => n[0].toLowerCase() === `${cls}_${key}.pow`)?.[2]
      || clsNodes.find(n => n[0].toLowerCase().replace(/_/g, "").includes(key))?.[2];
    if (hit) icons[ic] = hit;
  }
  const mech: Record<string, string> = {};
  for (const v of b.variants || []) if (v.mechanic) for (const val of Object.values(v.mechanic)) if (typeof val === "string" && /\.pow$/.test(val)) {
    const n = bySource.get(val.toLowerCase()); if (!n) continue;
    const base = bySource.get((val.replace(/_Passive.*$|_(Upgrade\w+|Sacrifice)\.pow$|_[A-C]\.pow$/i, "") + ".pow").toLowerCase());
    mech[val] = base && base !== n ? base + " · " + n : n;
  }
  return { map, sk, icons, mech, total: ids.size };
}

// Guide mentions come in the author's language (often English, sometimes Chinese). Replace them with the
// dataset's name for the link language: by entity id when the mention has one (skills, aspects), else by
// name through `alt` (other-language name → local name; see get_alt_names in main.py). Unknown mentions keep
// the author's text.
const CLASS_TOKENS = ["warlock", "necro", "necromancer", "sorc", "sorcerer", "barb", "barbarian", "rogue", "druid", "spiritborn", "paladin", "generic"];

const MENTION_RE = /\{([mulrs]):([^}§]*)§([^}§]*)§([^}]*)\}/g;

// which other-language name tables the guide needs: mentions without an id are matched by name
export function mentionSources(notes: Notes, lang: Lang): string[] {
  const need = new Set<string>();
  const text = notes.flatMap(o => Object.values(o).flatMap(c => [...(c.items || []), ...(c.steps || []), c.tip || ""])).join("\n");
  for (const m of text.matchAll(MENTION_RE)) {
    if (m[4]) continue;
    if (/[㐀-鿿]/.test(m[2])) need.add("zh");
    else if (lang !== "en" && /[A-Za-z]/.test(m[2]) && !/[가-힣]/.test(m[2])) need.add("en");
  }
  return [...need];
}

export function localizeNotes(notes: Notes, ds: DatasetIndex, cls: string, alt: Record<string, string> = {}): Notes {
  const bySource = new Map<string, string>(ds.nodes.map(n => [n[0].toLowerCase(), n[2]]));
  const layout = new Map<string, [string, string, string, string]>((ds.layouts[cls] || []).map(n => [n[0], n]));
  const resolve = (label: string, kind: string, id: string): string => {
    if (id) {
      if (/^\d+$/.test(id)) {
        const n = layout.get(`${cls}::skill-${id}`);
        if (n) {
          const base = n[1] ? bySource.get((n[1] + ".pow").toLowerCase()) : undefined;
          if (base) return n[2] === "skill" || !n[3] || n[3] === base ? base : `${base} · ${n[3]}`;
        }
      } else {
        const direct = ds.labels[id] || ds.labels[id.replace(/^(item|aspect|affix)-\d+-/, "$1-")];
        if (direct) return direct;
        // the site localizes the class token inside some ids (aspect-asp-legendary-악마술사-029-asp)
        if (/[^\x00-\x7f]/.test(id)) for (const tok of CLASS_TOKENS) { const l = ds.labels[id.replace(/[^\x00-\x7f]+/g, tok)]; if (l) return l; }
      }
    }
    return alt[label.toLowerCase()] || label;
  };
  const fix = (s: string) => s.replace(MENTION_RE, (_, k, label, kind, id) => `{${k}:${resolve(label, kind, id).replace(/[{}]/g, "")}}`);
  return notes.map(o => {
    const out: Record<string, NoteCard> = {};
    for (const [key, card] of Object.entries(o)) out[key] = { ...card, items: card.items?.map(fix), steps: card.steps?.map(fix), tip: card.tip ? fix(card.tip) : undefined };
    return out;
  });
}

export function linkLang(url: string): Lang {
  return /infinitybuilds\.gg\/ko\//.test(url) ? "ko" : "en";
}

export function isBuildLink(url: string): boolean {
  return /^https?:\/\/(www\.)?infinitybuilds\.gg\/[\w-]+\/builds\/[\w-]+/.test(url);
}

export function extractLink(text: string): string {
  const m = text.match(/https?:\/\/\S+/);
  return (m ? m[0] : text).trim().replace(/^http:/, "https:");
}
