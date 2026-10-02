/**
 * Emoji share text. Actor names are never included.
 * Mobile uses the Web Share API when it exists; everything else copies.
 */

import { shareSquares } from "./game.js";

export function buildShareText({ puzzle, streak, rounds, url }) {
  const lines = rounds.map((round, index) => `Actor ${index + 1}: ${shareSquares(round)}`);
  return `Box Office #${puzzle} 🎬 Streak: ${streak}\n${lines.join("\n")}\n${url}`;
}

export function gameUrl() {
  if (typeof location === "undefined") return "";
  return location.href.split("#")[0].split("?")[0];
}

function wantsShareSheet() {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export async function shareResult(text) {
  if (wantsShareSheet()) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (error) {
      if (error && error.name === "AbortError") return "aborted";
    }
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      // Permission can be denied even on a click. Fall through to the textarea copy.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy failed");
  return "copied";
}
