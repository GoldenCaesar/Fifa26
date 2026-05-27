# Official FIFA World Cup 2026 Schedule Update

## Problem Identified
The app was generating **fake/incorrect matches** instead of using the **official FIFA schedule**.

### Examples of Errors Found:
- ❌ App showed: "Czechia vs Mexico - Jun 11"  
- ✅ Reality: These teams DON'T play on June 11  
- ✅ Actual Jun 11: Mexico vs South Africa, South Korea vs Czechia

## Root Cause
The `generateWorldCup2026Schedule()` function was creating randomized match pairings based on a simple algorithm, not the real FIFA schedule.

## Solution
Replace the fake generator with the **official FIFA World Cup 2026 schedule** extracted from FIFA/Wikipedia.

---

## Official Group A Schedule (From FIFA)

| Match | Date | Time (Local) | Home | Away | Venue |
|-------|------|--------------|------|------|-------|
| 1 | Jun 11 | 1:00 PM | Mexico | South Africa | Estadio Azteca, Mexico City |
| 2 | Jun 11 | 8:00 PM | South Korea | Czech Republic | Estadio Akron, Guadalajara |
| 25 | Jun 18 | 12:00 PM | Czech Republic | South Africa | Mercedes-Benz Stadium, Atlanta |
| 28 | Jun 18 | 7:00 PM | Mexico | South Korea | Estadio Akron, Guadalajara |
| 53 | Jun 24 | 7:00 PM | Czech Republic | Mexico | Estadio Azteca, Mexico City |
| 54 | Jun 24 | 7:00 PM | South Africa | South Korea | Estadio BBVA, Monterrey |

---

## What Needs to Be Fixed

### 1. Edge Function (`supabase/functions/daily-refresh/index.ts`)
- Replace `generateWorldCup2026Schedule()` with official FIFA data
- Include all 104 matches with correct dates, times, venues
- Use Wikipedia's official schedule as source

### 2. Frontend (`app.js`)
- Remove local schedule generation entirely
- Always load from database (populated by Edge Function)
- Fallback only if database is empty

### 3. Database Population
- Deploy updated Edge Function
- Call it once to populate all 104 official matches
- Frontend loads from database on every app start

---

## Next Steps

1. **Extract full official schedule** from FIFA/Wikipedia (all 104 matches)
2. **Update Edge Function** with official data
3. **Deploy Edge Function** to Supabase
4. **Call Edge Function** to populate database
5. **Test frontend** - verify correct matches appear

---

## Official Data Source
- Wikipedia: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup
- FIFA: https://www.fifa.com/tournaments/mens/worldcup/canadamexicousa2026
- Contains complete schedule for all 104 matches (72 group + 32 knockout)

---

## Benefits
✅ **100% accurate** match schedule  
✅ **Real FIFA data** - not generated  
✅ **Correct dates** - matches on actual days  
✅ **Correct opponents** - official pairings  
✅ **Real venues** - actual stadiums  
✅ **Future-proof** - when APIs add 2026 data, we can switch to live odds

