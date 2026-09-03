export const PROMO_UNLOCK_KEY = "ege-prep:promo-unlock";

export function isPromoUnlocked() {
  try {
    return localStorage.getItem(PROMO_UNLOCK_KEY) === "1";
  } catch (err) {
    return false;
  }
}

export function persistPromoUnlock() {
  try {
    localStorage.setItem(PROMO_UNLOCK_KEY, "1");
  } catch (err) {
    /* ignore quota / private mode */
  }
}

export function clearPromoUnlock() {
  try {
    localStorage.removeItem(PROMO_UNLOCK_KEY);
  } catch (err) {
    /* ignore quota / private mode */
  }
}

export function requirePromoUnlock(fallbackHref) {
  if (!isPromoUnlocked()) {
    location.replace(fallbackHref || "index.html");
  }
}
