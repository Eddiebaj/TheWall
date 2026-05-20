import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

function getCurrentDay(): string {
  return ['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()]
}

function getMinutesFromNow(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const now = new Date()
  const departure = new Date()
  departure.setHours(hours, minutes, 0, 0)
  return (departure.getTime() - now.getTime()) / 60000
}

Deno.serve(async () => {
  const today = getCurrentDay()

  const { data: commutes } = await supabase
    .from('saved_commutes')
    .select('*')
    .eq('is_active', true)
    .contains('days_active', [today])

  if (!commutes?.length) return new Response('No commutes', { status: 200 })

  const upcoming = commutes.filter(c => {
    const mins = getMinutesFromNow(c.departure_time)
    return mins >= 10 && mins <= 20
  })

  for (const commute of upcoming) {
    const rtRes = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/arrivals?stop_id=${commute.stop_id}&route=${commute.route_id}`,
      { headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` } }
    )
    const rtData = await rtRes.json()
    const delay = rtData?.delay_minutes ?? 0

    if (!commute.push_token) continue

    if (delay > 5) {
      const leaveIn = Math.round(getMinutesFromNow(commute.departure_time) + delay)
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: commute.push_token,
          title: `Your ${commute.route_id} is running late`,
          body: `OC Transpo is reporting a ${delay} min delay  -  consider leaving a bit later`,
          sound: 'default'
        })
      })
    }
  }

  return new Response('Done', { status: 200 })
})
