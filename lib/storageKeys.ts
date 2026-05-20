/**
 * Centralized AsyncStorage key constants.
 * Every key used across the app should be defined here to avoid typos
 * and make it easy to audit stored data.
 */

// ── User preferences ──
export const SK_ONBOARDED = 'thewall_onboarded';
export const SK_THEME = 'thewall_theme';
export const SK_LARGE_TEXT = 'thewall_largetext';
export const SK_CONTRAST = 'thewall_contrast';
export const SK_MOTION = 'thewall_motion';
export const SK_LANGUAGE = 'thewall_language';
export const SK_PALETTE = 'thewall_palette';
export const SK_TIME_FORMAT = 'thewall_time_format';
export const SK_ACCESSIBILITY_ROUTING = 'thewall_accessibility_routing';
export const SK_WALK_PREFERENCE = 'thewall_walk_preference';
export const SK_WALK_PACE = 'thewall_walk_pace';
export const SK_BATTERY_SAVER = 'thewall_battery_saver';

// ── Saved items & board ──
export const SK_FAVS = 'thewall_favs';
export const SK_SAVED_BOARD = 'thewall_saved_board';
export const SK_SAVED_ROUTES = 'thewall_saved_routes';
export const SK_SAVED_PLACES = 'thewall_saved_places';
export const SK_SAVED_VENUES = 'thewall_saved_venues';
export const SK_SECTION_ORDER = 'thewall_section_order';
export const SK_QUICK_ACTIONS = 'thewall_quick_actions';
export const SK_OTTAWA_LIFE = 'thewall_ottawa_life';
export const SK_MAP_LAYERS = 'thewall_map_layers';

// ── Transit & trips ──
export const SK_PLANNER_PREFS = 'thewall_planner_prefs';
export const SK_TRIP_HISTORY = 'thewall_trip_history';
export const SK_TRIP_SHARING = 'thewall_trip_sharing';
export const SK_HOME_ADDRESS = 'thewall_home_address';
export const SK_LEAVE_REMINDERS = 'thewall_leave_reminders';
export const SK_LEAVE_NOW_ALERTS = 'thewall_leave_now_alerts';
export const SK_GHOST_REPORTS = 'thewall_ghost_reports';
export const SK_FREQUENT_CARD_DISMISSED = 'thewall_frequent_card_dismissed';
export const SK_FREQUENT_ARRIVALS_CACHE = 'thewall_frequent_arrivals_cache';

// ── Notifications ──
export const SK_NOTIF_SETTINGS = 'thewall_notif_settings';
export const SK_PUSH_TOKEN = 'thewall_push_token';
export const SK_DEVICE_ID = 'thewall_device_id';
export const SK_SEEN_ALERT_IDS = 'thewall_seen_alert_ids';

// ── Caches & city data ──
export const SK_CACHE_WEATHER = 'thewall_cache_weather';
export const SK_ARRIVAL_CACHE = 'thewall_arrival_cache';
export const SK_NEWS_CACHE = 'thewall_news_cache';
export const SK_TODAY_EVENTS = 'thewall_today_events';
export const SK_CROWDING_CACHE = 'thewall_crowding_cache';
export const SK_LAST_CROWDING_REPORT = 'thewall_last_crowding_report';
export const SK_WEATHER_BANNER_DISMISSED = 'thewall_weather_banner_dismissed';
export const SK_CAMPUS = 'thewall_campus';
export const SK_CLASS_SCHEDULE = 'thewall_class_schedule';
export const SK_COMMUTE_DURATION = 'thewall_commute_duration';
export const SK_SAVED_NEIGHBOURHOODS = 'thewall_saved_neighbourhoods';
export const SK_TONIGHT_DISMISSED = 'thewall_tonight_dismissed';
// Dynamic: `${SK_DEAL_SUBMIT_PREFIX}${deviceId}`
export const SK_DEAL_SUBMIT_PREFIX = 'thewall_deal_submit_';
export const SK_COMMUTE_ALERT = 'thewall_commute_alert';
export const SK_CRASH_LOG = 'thewall_crash_log';
export const SK_ANALYTICS = 'thewall_analytics';
export const SK_TASTE_PROFILE = 'thewall_taste_profile';
export const SK_FOLLOWED_VENUES = 'thewall_followed_venues';
export const SK_JOINED_GROUPS = 'thewall_joined_groups';
export const SK_LAST_DEAL_CHECK = 'thewall_last_deal_check';
export const SK_RECENT_SEARCHES = 'thewall_recent_searches';
export const SK_WORK_PLACE = 'thewall_work_place';
export const SK_DISMISSED_ALERT_IDS = 'thewall_dismissed_alert_ids';
export const SK_SESSION_COUNT = 'thewall_session_count';
export const SK_SHOWN_PROMPTS = 'thewall_shown_prompts';
export const SK_WATCHED_BUSES = 'thewall_watched_buses';
export const SK_COMMUTE_DEALS_LAST_PUSH = 'thewall_commute_deals_last_push';

// ── Invite / referral ──
export const SK_INVITED_BY = 'thewall_invited_by';
export const SK_PROFILE_SETUP_DONE = 'thewall_profile_setup_done';
