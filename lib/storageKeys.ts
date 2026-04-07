/**
 * Centralized AsyncStorage key constants.
 * Every key used across the app should be defined here to avoid typos
 * and make it easy to audit stored data.
 */

// ── User preferences ──
export const SK_ONBOARDED = 'routeo_onboarded';
export const SK_THEME = 'routeo_theme';
export const SK_LARGE_TEXT = 'routeo_largetext';
export const SK_CONTRAST = 'routeo_contrast';
export const SK_MOTION = 'routeo_motion';
export const SK_LANGUAGE = 'routeo_language';
export const SK_PALETTE = 'routeo_palette';
export const SK_TIME_FORMAT = 'routeo_time_format';
export const SK_ACCESSIBILITY_ROUTING = 'routeo_accessibility_routing';
export const SK_WALK_PREFERENCE = 'routeo_walk_preference';
export const SK_WALK_PACE = 'routeo_walk_pace';
export const SK_BATTERY_SAVER = 'routeo_battery_saver';

// ── Saved items & board ──
export const SK_FAVS = 'routeo_favs';
export const SK_SAVED_BOARD = 'routeo_saved_board';
export const SK_SAVED_TEAMS = 'routeo_saved_teams';
export const SK_SAVED_ROUTES = 'routeo_saved_routes';
export const SK_SAVED_PLACES = 'routeo_saved_places';
export const SK_SAVED_NEIGHBOURHOODS = 'routeo_saved_neighbourhoods';
export const SK_HOME_NEIGHBOURHOOD = 'routeo_home_neighbourhood';
export const SK_SAVED_ARTICLES = 'routeo_saved_articles';
export const SK_SECTION_ORDER = 'routeo_section_order';
export const SK_QUICK_ACTIONS = 'routeo_quick_actions';
export const SK_OTTAWA_LIFE = 'routeo_ottawa_life';
export const SK_MAP_LAYERS = 'routeo_map_layers';

// ── Transit & trips ──
export const SK_PLANNER_PREFS = 'routeo_planner_prefs';
export const SK_TRIP_HISTORY = 'routeo_trip_history';
export const SK_TRIP_SHARING = 'routeo_trip_sharing';
export const SK_COMMUTE_PATTERNS = 'routeo_commute_patterns';
export const SK_HOME_ADDRESS = 'routeo_home_address';
export const SK_LEAVE_REMINDERS = 'routeo_leave_reminders';
export const SK_LEAVE_NOW_ALERTS = 'routeo_leave_now_alerts';
export const SK_GHOST_REPORTS = 'routeo_ghost_reports';
export const SK_PRESTO_BALANCE = 'routeo_presto_balance';
export const SK_PRESTO_RESET_DATE = 'routeo_presto_reset_date';
export const SK_CO2_TOTAL = 'routeo_co2_total';
export const SK_FREQUENT_CARD_DISMISSED = 'routeo_frequent_card_dismissed';
export const SK_FREQUENT_ARRIVALS_CACHE = 'routeo_frequent_arrivals_cache';

// ── Notifications ──
export const SK_NOTIF_SETTINGS = 'routeo_notif_settings';
export const SK_PUSH_TOKEN = 'routeo_push_token';
export const SK_DEVICE_ID = 'routeo_device_id';
export const SK_SEEN_ALERT_IDS = 'routeo_seen_alert_ids';
export const SK_ALERT_HISTORY = 'routeo_alert_history';

// ── Caches & city data ──
export const SK_CACHE_WEATHER = 'routeo_cache_weather';
export const SK_CACHE_ALERTS = 'routeo_cache_alerts';
export const SK_CACHE_ARRIVALS = 'routeo_cache_arrivals';
export const SK_ARRIVAL_CACHE = 'routeo_arrival_cache';
export const SK_NEWS_CACHE = 'routeo_news_cache';
export const SK_TODAY_EVENTS = 'routeo_today_events';
export const SK_PARKING_CACHE = 'routeo_parking_cache';
export const SK_CROWDING_CACHE = 'routeo_crowding_cache';
export const SK_LAST_CROWDING_REPORT = 'routeo_last_crowding_report';
export const SK_WEATHER_BANNER_DISMISSED = 'routeo_weather_banner_dismissed';
export const SK_TONIGHT_DISMISSED = 'routeo_tonight_dismissed';
export const SK_GAS_VOTED_IDS = 'routeo_gas_voted_ids';
export const SK_GARBAGE_ADDRESS = 'routeo_garbage_address';
export const SK_GARBAGE_LAT = 'routeo_garbage_lat';
export const SK_GARBAGE_LNG = 'routeo_garbage_lng';
export const SK_GARBAGE_PLACE_ID = 'routeo_garbage_place_id';
export const SK_GARBAGE_NOTIF_ID = 'routeo_garbage_notif_id';
export const SK_CAMPUS = 'routeo_campus';
export const SK_CLASS_SCHEDULE = 'routeo_class_schedule';
export const SK_COMMUTE_DURATION = 'routeo_commute_duration';
export const SK_MY_DEAL_VOTES = 'routeo_my_deal_votes';
// Dynamic: `${SK_DEAL_SUBMIT_PREFIX}${deviceId}`
export const SK_DEAL_SUBMIT_PREFIX = 'routeo_deal_submit_';
export const SK_CRASH_LOG = 'routeo_crash_log';
export const SK_ANALYTICS = 'routeo_analytics';
