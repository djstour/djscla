/**
 * Preserve and restore hyperlinks when vendor HTML is translated to plain text.
 */

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'");
}

function normalizeLinkText(text) {
  return decodeHtmlEntities(text)
    .replace(/\s+/g, ' ')
    .replace(/[''']/g, "'")
    .trim();
}

/** @returns {Array<{ href: string, text: string }>} */
function extractLinksFromHtml(html) {
  const raw = String(html || '');
  if (!raw || !/<a\b/i.test(raw)) return [];
  const out = [];
  const re = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(raw))) {
    const href = decodeHtmlEntities(m[1] || m[2] || '').trim();
    const text = normalizeLinkText(m[3]);
    if (!href || !text) continue;
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) continue;
    out.push({ href, text });
  }
  return out;
}

const LINK_TEXT_ZH_CANDIDATES = [
  ["arctic adventures' pick-up list", ['北極冒險的接送清單', '北极冒险的接送清单', 'Arctic Adventures 接送清單']],
  ['pick-up list', ['接送清單', '接駁清單', '接送列表', '接送清单', '接驳清单']],
  ['pick up list', ['接送清單', '接駁清單', '接送清单']],
  ['customer care', ['客戶服務', '客户服务', '客服中心', '客戶支援', '客户支持']],
  ['tour description', ['行程說明', '旅遊說明', '行程描述']],
  ['northern lights photos', ['極光照片']],
  ['rental equipment', ['租賃裝備', '裝備租借']],
  ['tripadvisor', ['Tripadvisor', '貓途鷹']],
];

/** Likely Chinese (or unchanged) anchor labels for an English link phrase. */
function linkTextZhCandidates(englishText) {
  const en = normalizeLinkText(englishText);
  const lower = en.toLowerCase();
  const out = [];
  const push = (s) => {
    const t = String(s || '').trim();
    if (t && !out.includes(t)) out.push(t);
  };
  push(en);
  for (let i = 0; i < LINK_TEXT_ZH_CANDIDATES.length; i += 1) {
    const [key, zhList] = LINK_TEXT_ZH_CANDIDATES[i];
    if (lower.includes(key)) zhList.forEach(push);
  }
  if (/pick[- ]?up/i.test(lower)) push('接送清單');
  if (/customer/i.test(lower) && /care|service/i.test(lower)) {
    push('客戶服務');
    push('客户服务');
  }
  return out;
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isInsideAnchor(html, pos) {
  const open = html.lastIndexOf('<a', pos);
  if (open < 0) return false;
  const close = html.indexOf('</a>', open);
  return close < 0 || pos <= close + 4;
}

function overlapsRange(pos, len, ranges) {
  const end = pos + len;
  return ranges.some((r) => pos < r.end && end > r.start);
}

function findLinkableTextIndex(html, text, usedRanges) {
  const needle = String(text || '');
  if (!needle) return -1;
  let i = 0;
  while (i < html.length) {
    const tagStart = html.indexOf('<', i);
    const hit = html.indexOf(needle, i);
    if (hit < 0) return -1;
    if (tagStart < 0 || hit < tagStart) {
      if (!isInsideAnchor(html, hit) && !overlapsRange(hit, needle.length, usedRanges)) return hit;
      i = hit + 1;
      continue;
    }
    const tagEnd = html.indexOf('>', tagStart);
    if (tagEnd < 0) return -1;
    const tag = html.slice(tagStart, tagEnd + 1);
    if (/^<a\b/i.test(tag)) {
      const closeA = html.indexOf('</a>', tagEnd);
      i = closeA >= 0 ? closeA + 4 : tagEnd + 1;
    } else {
      i = tagEnd + 1;
    }
  }
  return -1;
}

/**
 * Wrap translated labels in <a> using hrefs from English source HTML.
 * @param {string} html — sanitized or structured HTML without links yet
 * @param {string} sourceHtml — English Bókun HTML with <a> tags
 */
function injectLinksIntoHtml(html, sourceHtml) {
  const out = String(html || '');
  const source = String(sourceHtml || '');
  if (!out || !source) return out;
  const links = extractLinksFromHtml(source);
  if (!links.length) return out;

  const usedRanges = [];
  const replacements = [];
  const sortedLinks = links.slice().sort((a, b) => b.text.length - a.text.length);

  for (let i = 0; i < sortedLinks.length; i += 1) {
    const link = sortedLinks[i];
    const cands = linkTextZhCandidates(link.text).sort((a, b) => b.length - a.length);
    for (let c = 0; c < cands.length; c += 1) {
      const zh = cands[c];
      const pos = findLinkableTextIndex(out, zh, usedRanges);
      if (pos < 0) continue;
      usedRanges.push({ start: pos, end: pos + zh.length });
      replacements.push({ pos, len: zh.length, zh, href: link.href });
      break;
    }
  }

  if (!replacements.length) return out;
  replacements.sort((a, b) => b.pos - a.pos);
  let result = out;
  for (let r = 0; r < replacements.length; r += 1) {
    const item = replacements[r];
    const anchor = `<a href="${escapeAttr(item.href)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(item.zh)}</a>`;
    result = result.slice(0, item.pos) + anchor + result.slice(item.pos + item.len);
  }
  return result;
}

/** Convert <a> to [label](url) before stripping tags for OpenAI. */
function htmlLinksToMarkdown(html) {
  return String(html || '').replace(
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi,
    (_, h1, h2, inner) => {
      const href = decodeHtmlEntities(h1 || h2 || '').trim();
      const label = normalizeLinkText(inner);
      if (!href || !label) return label;
      return `[${label}](${href})`;
    },
  );
}

/** Restore [label](url) from translated copy to <a>. */
function markdownLinksToHtml(text) {
  return String(text || '').replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|tel:[^)\s]+)\)/gi,
    (_, label, href) => `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(label.trim())}</a>`,
  );
}

const api = {
  decodeHtmlEntities,
  normalizeLinkText,
  extractLinksFromHtml,
  linkTextZhCandidates,
  injectLinksIntoHtml,
  htmlLinksToMarkdown,
  markdownLinksToHtml,
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.AuralisVendorHtmlLinks = api;
}
