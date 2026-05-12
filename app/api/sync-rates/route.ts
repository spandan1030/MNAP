import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const envSecret = process.env.SYNC_RATES_SECRET
    console.log('env secret set:', !!envSecret, '| length:', envSecret?.length ?? 0)
    console.log('received secret length:', body.secret?.length ?? 0)

    if (!envSecret || body.secret !== envSecret) {
      return NextResponse.json({ error: 'Unauthorized', debug: { envSet: !!envSecret, match: body.secret === envSecret } }, { status: 401 })
    }

    const { rate_18kt, rate_22kt, rate_24kt } = body
    if (rate_18kt == null || rate_22kt == null || rate_24kt == null) {
      return NextResponse.json({ error: 'Missing one or more rate values' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const today = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]

    // Preserve any manually-entered silver rate for today
    const { data: existing } = await supabase
      .from('daily_rates')
      .select('rate_silver')
      .eq('date', today)
      .maybeSingle()

    const { error } = await supabase
      .from('daily_rates')
      .upsert({
        date: today,
        rate_24kt: Number(rate_24kt),
        rate_22kt: Number(rate_22kt),
        rate_18kt: Number(rate_18kt),
        rate_silver: existing?.rate_silver ?? null,
        source: 'google_sheets',
        updated_by: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'date' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, date: today })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Unknown error' }, { status: 500 })
  }
}
