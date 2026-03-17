import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView,
  Text, TouchableOpacity, View,
} from 'react-native';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';

type OttawaTeam = {
  name: string;
  png: any;
  url: string;
  nhl?: string;
  espn?: { sport: string; league: string; abbr: string };
};

const OTTAWA_TEAMS: OttawaTeam[] = [
  { name: 'Senators',   png: require('../assets/images/2025-01-ottawa-senators-logo.webp'), url: 'https://www.ticketmaster.ca/ottawa-senators-tickets/artist/806004', nhl: 'ott' },
  { name: 'REDBLACKS',  png: require('../assets/images/ottawa-redblacks-logo-2023-featured.png'), url: 'https://www.ticketmaster.ca/ottawa-redblacks-tickets/artist/1537798', espn: { sport: 'football', league: 'cfl', abbr: 'ORB' } },
  { name: "67's",       png: require('../assets/images/Ottawa_67\'s_logo.svg.png'), url: 'https://ontariohockeyleague.com/team/30/ottawa-67s' },
  { name: 'Charge',     png: require('../assets/images/ottawa_charge_logosvg.webp'), url: 'https://thepwhl.com/en/stats/team/10' },
  { name: 'Blackjacks', png: require('../assets/images/Ottawa_Blackjacks_logo.png'), url: 'https://cebl.ca/team/ottawa-blackjacks' },
  { name: 'Atl\u00E9tico',   png: require('../assets/images/Atletico_Ottawa_logo.png'), url: 'https://atletico.ca/schedule' },
  { name: 'Rapid FC',   png: require('../assets/images/Ottawa_Rapid_FC.png'), url: 'https://ottawarapidfc.com/schedule' },
];

const SPORTS_MODAL_TABS = [
  { id: 'teams' as const, label_en: 'Teams', label_fr: '\u00C9quipes', icon: 'people' },
  { id: 'scores' as const, label_en: 'Scores', label_fr: 'Scores', icon: 'football' },
  { id: 'schedule' as const, label_en: 'Schedule', label_fr: 'Calendrier', icon: 'calendar' },
];

type SportsModalProps = {
  visible: boolean;
  onClose: () => void;
  colours: any;
  fonts: any;
  t: (en: string, fr: string) => string;
  language: string;
  savedTeams: string[];
  onToggleTeam: (name: string) => void;
  initialTab?: 'teams' | 'scores' | 'schedule';
  onScheduleLoaded?: (schedule: any[]) => void;
};

export default function SportsModal({ visible, onClose, colours, fonts, t, language, savedTeams, onToggleTeam, initialTab, onScheduleLoaded }: SportsModalProps) {
  const [sportsTab, setSportsTab] = useState<'teams' | 'scores' | 'schedule'>('teams');
  const [sportsScores, setSportsScores] = useState<any[]>([]);
  const [sportsScoresLoading, setSportsScoresLoading] = useState(false);
  const [sportsSchedule, setSportsSchedule] = useState<any[]>([]);
  const [sportsScheduleLoading, setSportsScheduleLoading] = useState(false);

  // Handle initialTab prop when modal opens
  useEffect(() => {
    if (visible && initialTab) {
      setSportsTab(initialTab);
      if (initialTab === 'scores') fetchSportsScores();
      if (initialTab === 'schedule') fetchSportsSchedule();
    }
    if (!visible) setSportsTab('teams');
  }, [visible]);

  const fetchSportsScores = async () => {
    setSportsScoresLoading(true);
    const results: any[] = [];
    const teamsToFetch = OTTAWA_TEAMS.filter(t => t.nhl || t.espn);
    for (const team of teamsToFetch) {
      try {
        if (team.nhl) {
          const resp = await fetchWithTimeout('https://api-web.nhle.com/v1/schedule/now');
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          const today = new Date().toLocaleDateString('en-CA');
          const todayEntry = (data.gameWeek || []).find((d: any) => d.date === today);
          const game = (todayEntry?.games || []).find((g: any) => g.awayTeam?.abbrev === team.nhl!.toUpperCase() || g.homeTeam?.abbrev === team.nhl!.toUpperCase());
          if (game) {
            const gs = game.gameState;
            const state = (gs === 'LIVE' || gs === 'CRIT') ? 'in' : gs === 'FINAL' ? 'post' : 'pre';
            const startTime = new Date(game.startTimeUTC).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
            results.push({
              team: team.name,
              homeName: game.homeTeam?.placeName?.default || game.homeTeam?.abbrev || '?',
              homeAbbr: game.homeTeam?.abbrev || '?',
              homeScore: state === 'pre' ? '-' : String(game.homeTeam?.score ?? '0'),
              awayName: game.awayTeam?.placeName?.default || game.awayTeam?.abbrev || '?',
              awayAbbr: game.awayTeam?.abbrev || '?',
              awayScore: state === 'pre' ? '-' : String(game.awayTeam?.score ?? '0'),
              status: state === 'in' ? `P${game.period || '?'} \u00B7 ${game.clock || ''}` : state === 'post' ? (game.periodDescriptor?.periodType === 'OT' ? 'Final/OT' : game.periodDescriptor?.periodType === 'SO' ? 'Final/SO' : 'Final') : startTime,
              state,
            });
          } else {
            results.push({ team: team.name, noGame: true });
          }
        } else if (team.espn) {
          const resp = await fetchWithTimeout(`https://site.api.espn.com/apis/site/v2/sports/${team.espn.sport}/${team.espn.league}/scoreboard`);
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          const game = (data.events || []).find((ev: any) =>
            (ev.competitions?.[0]?.competitors || []).some((c: any) => c.team?.abbreviation === team.espn!.abbr)
          );
          if (game) {
            const comp = game.competitions[0];
            const home = comp.competitors.find((c: any) => c.homeAway === 'home');
            const away = comp.competitors.find((c: any) => c.homeAway === 'away');
            const state = comp.status?.type?.state;
            results.push({
              team: team.name,
              homeName: home?.team?.displayName || '?',
              homeAbbr: home?.team?.abbreviation || '?',
              homeScore: home?.score || '0',
              awayName: away?.team?.displayName || '?',
              awayAbbr: away?.team?.abbreviation || '?',
              awayScore: away?.score || '0',
              status: comp.status?.type?.shortDetail || comp.status?.type?.description || '',
              state,
            });
          } else {
            results.push({ team: team.name, noGame: true });
          }
        }
      } catch {
        results.push({ team: team.name, noGame: true });
      }
    }
    setSportsScores(results);
    setSportsScoresLoading(false);
  };

  const fetchSportsSchedule = async () => {
    setSportsScheduleLoading(true);
    const results: any[] = [];
    const teamsToFetch = OTTAWA_TEAMS.filter(t => t.nhl || t.espn);
    for (const team of teamsToFetch) {
      try {
        if (team.nhl) {
          const resp = await fetchWithTimeout(`https://api-web.nhle.com/v1/club-schedule-season/${team.nhl}/now`);
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          const now = new Date();
          const upcoming = (data.games || [])
            .filter((g: any) => new Date(g.startTimeUTC) > now && (g.gameState === 'FUT' || g.gameState === 'PRE'))
            .slice(0, 5)
            .map((g: any) => {
              const isHome = g.homeTeam?.abbrev?.toLowerCase() === team.nhl;
              const opp = isHome ? g.awayTeam : g.homeTeam;
              return {
                date: g.startTimeUTC,
                opponent: opp?.name?.default || opp?.commonName?.default || '?',
                opponentAbbr: opp?.abbrev || '?',
                homeAway: isHome ? 'vs' : '@',
                status: '',
              };
            });
          results.push({ team: team.name, games: upcoming });
        } else if (team.espn) {
          const resp = await fetchWithTimeout(`https://site.api.espn.com/apis/site/v2/sports/${team.espn.sport}/${team.espn.league}/teams/${team.espn.abbr}/schedule`);
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          const now = new Date();
          const upcoming = (data.events || [])
            .filter((ev: any) => new Date(ev.date) > now)
            .slice(0, 5)
            .map((ev: any) => {
              const comp = ev.competitions?.[0];
              const us = (comp?.competitors || []).find((c: any) => c.team?.abbreviation === team.espn!.abbr);
              const them = (comp?.competitors || []).find((c: any) => c.team?.abbreviation !== team.espn!.abbr);
              return {
                date: ev.date,
                opponent: them?.team?.displayName || '?',
                opponentAbbr: them?.team?.abbreviation || '?',
                homeAway: us?.homeAway === 'home' ? 'vs' : '@',
                status: comp?.status?.type?.description || '',
              };
            });
          results.push({ team: team.name, games: upcoming });
        }
      } catch {
        results.push({ team: team.name, games: [] });
      }
    }
    // Hardcoded schedules for teams without API
    const now = new Date();
    const CHARGE_SCHEDULE = [
      { date: '2026-04-08T23:00:00Z', opponent: 'Seattle Torrent', opponentAbbr: 'SEA', homeAway: 'vs' },
      { date: '2026-04-18T18:00:00Z', opponent: 'New York Sirens', opponentAbbr: 'NY', homeAway: 'vs' },
      { date: '2026-04-25T23:00:00Z', opponent: 'Toronto Sceptres', opponentAbbr: 'TOR', homeAway: 'vs' },
    ].filter(g => new Date(g.date) > now).slice(0, 5).map(g => ({ ...g, status: '' }));
    if (CHARGE_SCHEDULE.length > 0) results.push({ team: 'Charge', games: CHARGE_SCHEDULE });

    const ATLETICO_SCHEDULE = [
      { date: '2026-04-04T20:00:00Z', opponent: 'Forge FC', opponentAbbr: 'FOR', homeAway: '@' },
      { date: '2026-04-12T20:00:00Z', opponent: 'Cavalry FC', opponentAbbr: 'CAV', homeAway: '@' },
      { date: '2026-04-19T18:00:00Z', opponent: 'Surge', opponentAbbr: 'SUR', homeAway: '@' },
      { date: '2026-04-26T17:00:00Z', opponent: 'Valour FC', opponentAbbr: 'VAL', homeAway: 'vs' },
      { date: '2026-05-01T23:30:00Z', opponent: 'York United', opponentAbbr: 'YRK', homeAway: '@' },
      { date: '2026-05-17T17:00:00Z', opponent: 'HFX Wanderers', opponentAbbr: 'HFX', homeAway: 'vs' },
      { date: '2026-05-24T18:00:00Z', opponent: 'Forge FC', opponentAbbr: 'FOR', homeAway: 'vs' },
      { date: '2026-05-30T22:00:00Z', opponent: 'Pacific FC', opponentAbbr: 'PAC', homeAway: '@' },
      { date: '2026-06-06T02:00:00Z', opponent: 'Valour FC', opponentAbbr: 'VAL', homeAway: '@' },
      { date: '2026-06-09T23:00:00Z', opponent: 'Surge', opponentAbbr: 'SUR', homeAway: 'vs' },
    ].filter(g => new Date(g.date) > now).slice(0, 5).map(g => ({ ...g, status: '' }));
    if (ATLETICO_SCHEDULE.length > 0) results.push({ team: 'Atl\u00E9tico', games: ATLETICO_SCHEDULE });

    const BLACKJACKS_SCHEDULE = [
      { date: '2026-05-12T23:30:00Z', opponent: 'Surge', opponentAbbr: 'SUR', homeAway: 'vs' },
      { date: '2026-05-18T23:00:00Z', opponent: 'River Lions', opponentAbbr: 'NIA', homeAway: 'vs' },
      { date: '2026-05-21T23:30:00Z', opponent: 'Honey Badgers', opponentAbbr: 'HB', homeAway: 'vs' },
      { date: '2026-05-23T23:00:00Z', opponent: 'Alliance', opponentAbbr: 'MTL', homeAway: 'vs' },
      { date: '2026-06-02T23:30:00Z', opponent: 'Bandits', opponentAbbr: 'VAN', homeAway: 'vs' },
      { date: '2026-06-04T23:30:00Z', opponent: 'Sea Bears', opponentAbbr: 'WPG', homeAway: 'vs' },
      { date: '2026-06-21T23:00:00Z', opponent: 'SSK', opponentAbbr: 'SSK', homeAway: 'vs' },
      { date: '2026-06-23T23:30:00Z', opponent: 'Shooting Stars', opponentAbbr: 'SCB', homeAway: 'vs' },
      { date: '2026-06-28T17:00:00Z', opponent: 'River Lions', opponentAbbr: 'NIA', homeAway: 'vs' },
      { date: '2026-07-08T23:30:00Z', opponent: 'Alliance', opponentAbbr: 'MTL', homeAway: 'vs' },
      { date: '2026-07-12T20:00:00Z', opponent: 'Honey Badgers', opponentAbbr: 'HB', homeAway: 'vs' },
      { date: '2026-07-22T23:30:00Z', opponent: 'Shooting Stars', opponentAbbr: 'SCB', homeAway: 'vs' },
    ].filter(g => new Date(g.date) > now).slice(0, 5).map(g => ({ ...g, status: '' }));
    if (BLACKJACKS_SCHEDULE.length > 0) results.push({ team: 'Blackjacks', games: BLACKJACKS_SCHEDULE });

    const SIXTYSEVENS_SCHEDULE = [
      { date: '2026-03-18T19:00:00Z', opponent: 'Oshawa Generals', opponentAbbr: 'OSH', homeAway: 'vs' },
      { date: '2026-03-21T19:00:00Z', opponent: 'Kingston Frontenacs', opponentAbbr: 'KGN', homeAway: 'vs' },
    ].filter(g => new Date(g.date) > now).slice(0, 5).map(g => ({ ...g, status: '' }));
    if (SIXTYSEVENS_SCHEDULE.length > 0) results.push({ team: "67's", games: SIXTYSEVENS_SCHEDULE });

    setSportsSchedule(results);
    setSportsScheduleLoading(false);
    if (onScheduleLoaded) onScheduleLoaded(results);
  };

  const handleClose = () => {
    onClose();
    setSportsTab('teams');
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ width: '90%', maxWidth: 400, backgroundColor: colours.surface, borderRadius: 20, overflow: 'hidden', maxHeight: '85%' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: colours.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="trophy" size={20} color="#c8102e" />
              <Text style={{ fontSize: 18, fontWeight: '800', color: colours.text }}>{t('Ottawa Sports', 'Sports Ottawa')}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colours.border, backgroundColor: colours.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={16} color={colours.text} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 8 }}>
            {SPORTS_MODAL_TABS.map(tab => {
              const active = sportsTab === tab.id;
              return (
                <TouchableOpacity key={tab.id} onPress={() => {
                  setSportsTab(tab.id);
                  if (tab.id === 'scores') fetchSportsScores();
                  if (tab.id === 'schedule') fetchSportsSchedule();
                }} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, flex: 1, height: 34, borderRadius: 17, borderWidth: 1, backgroundColor: active ? colours.accent : colours.surface, borderColor: active ? colours.accent : colours.border }}>
                  <Ionicons name={tab.icon as any} size={13} color={active ? 'white' : colours.muted} />
                  <Text style={{ fontSize: fonts.sm, fontWeight: '700', color: active ? 'white' : colours.muted }}>{language === 'fr' ? tab.label_fr : tab.label_en}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tab content */}
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 6 }}>
            {/* Teams tab */}
            {sportsTab === 'teams' && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-start' }}>
                {OTTAWA_TEAMS.map(team => {
                  const isSaved = savedTeams.includes(team.name);
                  return (
                    <View key={team.name} style={{ width: '30%', alignItems: 'center', backgroundColor: colours.bg, borderRadius: 12, borderWidth: 1, borderColor: colours.border, paddingVertical: 14, paddingHorizontal: 4, position: 'relative' }}>
                      <Pressable onPress={() => onToggleTeam(team.name)} hitSlop={8} style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
                        <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={16} color={isSaved ? colours.accent : colours.muted} />
                      </Pressable>
                      <Pressable onPress={() => { if (team.nhl || team.espn) { setSportsTab('scores'); fetchSportsScores(); } else { Linking.openURL(team.url).catch(() => {}); } }} style={{ alignItems: 'center' }}>
                        <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                          <Image source={team.png} style={{ width: 72, height: 72 }} resizeMode="contain" />
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colours.text, textAlign: 'center' }} numberOfLines={1}>{team.name}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Scores tab */}
            {sportsTab === 'scores' && (() => {
              const withGames = sportsScores.filter(s => !s.noGame);
              return (
                <View style={{ gap: 12 }}>
                  {sportsScoresLoading ? (
                    <View style={{ padding: 32, alignItems: 'center' }}><ActivityIndicator color={colours.accent} /></View>
                  ) : withGames.length === 0 ? (
                    <View style={{ padding: 32, alignItems: 'center' }}>
                      <Ionicons name="football-outline" size={32} color={colours.muted} />
                      <Text style={{ fontSize: fonts.md, color: colours.muted, marginTop: 10, textAlign: 'center' }}>
                        {t('No games today', 'Aucun match aujourd\'hui')}
                      </Text>
                    </View>
                  ) : withGames.map((s, i) => (
                    <View key={i} style={{ backgroundColor: colours.bg, borderRadius: 12, borderWidth: 1, borderColor: colours.border, overflow: 'hidden', padding: 14 }}>
                      {/* Header: team name + badge */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="trophy" size={12} color={colours.accent} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colours.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.team}</Text>
                        </View>
                        {s.state === 'pre' && (
                          <View style={{ backgroundColor: colours.accent + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colours.accent }}>Tonight</Text>
                          </View>
                        )}
                        {s.state === 'in' && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#cc3b2a18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#cc3b2a' }} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#cc3b2a' }}>LIVE</Text>
                          </View>
                        )}
                        {s.state === 'post' && (
                          <Text style={{ fontSize: 10, fontWeight: '600', color: colours.muted }}>Final</Text>
                        )}
                      </View>
                      {/* Scoreboard: AWAY vs HOME */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={{ fontSize: 18, fontWeight: '900', color: colours.text }}>{s.awayAbbr}</Text>
                          {s.state !== 'pre' && (
                            <Text style={{ fontSize: 24, fontWeight: '900', color: s.state === 'in' ? '#cc3b2a' : colours.text, marginTop: 2 }}>{s.awayScore}</Text>
                          )}
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colours.muted, marginHorizontal: 8 }}>vs</Text>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={{ fontSize: 18, fontWeight: '900', color: colours.text }}>{s.homeAbbr}</Text>
                          {s.state !== 'pre' && (
                            <Text style={{ fontSize: 24, fontWeight: '900', color: s.state === 'in' ? '#cc3b2a' : colours.text, marginTop: 2 }}>{s.homeScore}</Text>
                          )}
                        </View>
                      </View>
                      {/* Status line */}
                      <View style={{ alignItems: 'center', marginTop: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Ionicons name={s.state === 'pre' ? 'time-outline' : s.state === 'in' ? 'radio' : 'checkmark-circle-outline'} size={12} color={s.state === 'in' ? '#cc3b2a' : colours.muted} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: s.state === 'in' ? '#cc3b2a' : colours.muted }}>{s.status}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              );
            })()}

            {/* Schedule tab */}
            {sportsTab === 'schedule' && (() => {
              const withGames = sportsSchedule.filter(s => s.games.length > 0);
              return (
                <View style={{ gap: 12 }}>
                  {sportsScheduleLoading ? (
                    <View style={{ padding: 32, alignItems: 'center' }}><ActivityIndicator color={colours.accent} /></View>
                  ) : withGames.length === 0 ? (
                    <View style={{ padding: 32, alignItems: 'center' }}>
                      <Ionicons name="calendar-outline" size={32} color={colours.muted} />
                      <Text style={{ fontSize: fonts.md, color: colours.muted, marginTop: 10, textAlign: 'center' }}>
                        {t('No upcoming games', 'Aucun match \u00E0 venir')}
                      </Text>
                    </View>
                  ) : withGames.map((s, i) => (
                    <View key={i} style={{ backgroundColor: colours.bg, borderRadius: 12, borderWidth: 1, borderColor: colours.border, overflow: 'hidden' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
                        <Ionicons name="trophy" size={12} color={colours.accent} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colours.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.team}</Text>
                      </View>
                      {s.games.map((g: any, j: number) => {
                        const d = new Date(g.date);
                        return (
                          <View key={j} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: j > 0 ? 1 : 0, borderTopColor: colours.border, gap: 10 }}>
                            <View style={{ width: 44 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: colours.accent }}>{d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</Text>
                              <Text style={{ fontSize: 10, color: colours.muted }}>{d.toLocaleDateString('en-CA', { weekday: 'short' })}</Text>
                            </View>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: g.homeAway === 'vs' ? colours.accent : colours.muted, width: 20, textAlign: 'center' }}>{g.homeAway}</Text>
                            <Text style={{ flex: 1, fontSize: fonts.md, fontWeight: '600', color: colours.text }} numberOfLines={1}>{g.opponent}</Text>
                            <Text style={{ fontSize: 11, color: colours.muted }}>{d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              );
            })()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export { OTTAWA_TEAMS };
