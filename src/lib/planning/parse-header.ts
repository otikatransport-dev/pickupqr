/**
 * Pulls the phone, class label and driver name out of the OCR text of a column header.
 * Same rules as the original page, kept pure so they can be tested without OCR running.
 */

export interface HeaderGuess {
  phone: string;
  clase: string;
  name: string;
}

/** Words that appear in the sheet's header cells but are not a driver's name. */
const NOT_A_NAME = /clas+e|open|pic|city|home|pickup|bonus|from|photo|ouvert|overt/i;

export function parseHeaderText(text: string): HeaderGuess {
  const txt = text || "";

  const phone = txt.match(/\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}/)?.[0].trim() ?? "";

  const claseMatch = txt.match(/clas+e\s*[0-9][a-z]?/i);
  const clase = claseMatch ? claseMatch[0].toLowerCase().replace(/\s+/g, " ") : "";

  const nameLine = txt
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ \-']{2,}$/.test(l) && !NOT_A_NAME.test(l));

  return { phone, clase, name: nameLine ? nameLine.toUpperCase() : "" };
}
