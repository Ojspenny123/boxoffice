/** Compact money and clue copy. Zero or missing figures render as an em dash. */

export function formatMoney(amount) {
  if (amount == null || !Number.isFinite(Number(amount)) || Number(amount) === 0) return "—";
  const value = Number(amount);
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  if (n >= 1e9) return `${sign}$${trimNumber(n / 1e9)}B`;
  if (n >= 1e6) return `${sign}$${trimNumber(n / 1e6)}M`;
  if (n >= 1e3) return `${sign}$${trimNumber(n / 1e3)}K`;
  return `${sign}$${Math.round(n)}`;
}

function trimNumber(value) {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(1);
}

export function birthDecade(year) {
  const decade = Math.floor(Number(year) / 10) * 10;
  return `${decade}s`;
}

export function awardsLine(wins, nominations) {
  const w = Number(wins) || 0;
  const n = Number(nominations) || 0;
  const winText = w === 1 ? "1 Oscar win" : `${w} Oscar wins`;
  const nomText = n === 1 ? "1 nomination" : `${n} nominations`;
  if (w === 0 && n === 0) return "No Oscar wins or nominations";
  if (n === 0) return winText;
  if (w === 0) return `No Oscar wins, ${nomText}`;
  return `${winText}, ${nomText}`;
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  return `${minutes}m ${pad(seconds)}s`;
}
