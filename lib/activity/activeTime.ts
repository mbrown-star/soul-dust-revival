/**
 * The most one activity ping can add to a sign-in's active time. Pages ping
 * once a minute while open (ActivityHeartbeat), so a longer gap means the
 * reader was away; two minutes leaves room for a late ping without counting
 * a closed tab, or the days between visits, as time on the site.
 */
export const ACTIVE_PING_CAP_SECONDS = 120;
