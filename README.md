# 🚚 LoadLoop

**Return-trip load booking + route-aware truck capacity optimization** (MERN: MongoDB, Express, React, Node).

LoadLoop helps trucks earn more by using their unused capacity **during the journey, not just on the return trip**.
It tracks vehicle capacity, onboard cargo, the planned route and the current location, finds shipments that fit along
the route, and estimates the extra profit before the driver says yes.

---

## Quick start

You need **Node.js 18+**. MongoDB is optional for a first look.

```bash
npm run install:all          # installs server + client

# Terminal 1 - API (http://localhost:5000)
npm run dev:server

# Terminal 2 - React app (http://localhost:5173)
npm run dev:client
```

Open **http://localhost:5173**.

### Database

| Option | How |
| --- | --- |
| **Zero setup (demo)** | Leave `MONGO_URI` empty. The server starts a temporary in-memory MongoDB and loads demo data. Data resets on restart. The first run downloads a MongoDB binary, so it needs internet. |
| **Real MongoDB** | Copy `server/.env.example` to `server/.env`, set `MONGO_URI` (local `mongodb://127.0.0.1:27017/loadloop` or a free MongoDB Atlas URI) and a long `JWT_SECRET`. Then run `npm run seed` once to load the demo data. |

### Demo accounts (password: `password123`)

| Role | Email |
| --- | --- |
| Customer | `anitha@loadloop.in`, `kiran@loadloop.in` |
| Driver | `ravi@loadloop.in` (verified, has the Eluru → Hyderabad truck), `suresh@loadloop.in`, `mahesh@loadloop.in` (unverified) |
| Admin | `admin@loadloop.in` |

### Single-server build (optional)

```bash
npm run build     # builds client/dist
npm start         # Express now serves the React app too on http://localhost:5000
```

### Tests

```bash
npm test          # 9 tests for the capacity, route, profit, cargo and matching engines
```

---

## 2-minute demo script

1. **Customer search (no login).** Home page → Vijayawada → Hyderabad, 500 kg, electronics. You get the *Truck Availability Card*:
   route stepper, capacity bar (on board / your shipment / free), cargo categories only (no sensitive details), route fit %, ETA.
2. **Book.** Sign up as a customer (or log in as Anitha) → *Request this truck*.
3. **Driver view.** Log in as `ravi@loadloop.in` → *Booking requests* → **Accept**. Open the trip: the cargo manifest now shows the booking and the
   capacity table shows how free space changes stop by stop.
4. **Dynamic capacity.** Press **Start trip**, then **Pick up** → available capacity drops. **Deliver** → it comes back.
5. **Live location.** **Simulate driving** moves the truck along the route (it pauses at each stop). The customer's dashboard shows "Truck is X km from …" and updates itself.
6. **Opportunities + profit.** Scroll to *Opportunities on your route*: 🟢 Recommended / 🟡 Consider / 🔴 Avoid, with the *How is this calculated?* profit breakdown.
   Eluru → Rajahmundry is 🔴 because it needs a large detour. **Send offer to customer** → the customer confirms from their dashboard.
7. **Return trip.** On any trip press **Create return trip**: an empty Hyderabad → Eluru truck that customers can book (the original LoadLoop idea).
8. **Admin.** Log in as admin → verify the unverified driver (their truck then appears in public search), see revenue and bookings.

---

## How it works (for your viva)

```
React  →  REST API (Express)  →  engines  →  MongoDB
```

React never talks to MongoDB directly. The five engines live in `server/src/services/`:

| Engine | File | What it does |
| --- | --- | --- |
| Vehicle capacity | `capacity.js` | `available = total − cargo on board`. Also checks the **peak load over the stretch** a shipment will travel, so a truck is not double-booked between two stops. Capacity is never stored, always derived from cargo statuses (`waiting → loaded → delivered`), so it cannot go out of sync. |
| Route | `route.js` | Measures where a pickup/drop sits along the planned route and how far off it is. Requires the right direction, pickup not already passed, and ≤ 25 km off the route. Detour = 2 × (pickup offset + drop offset). |
| Cargo | `compat.js` | Vehicle/cargo rules: perishables need a refrigerated truck, electronics/pharma need a covered vehicle, hazardous goods can't travel with food/FMCG/pharma. |
| Profit | `profit.js` | `profit = price − 5% commission − detour cost − extra load fuel − toll − handling`. |
| Matching | `matching.js` | Runs all checks in order and returns a 0–100 score (route 40%, capacity 20%, profit 25%, compatibility 15%) and a label: Recommended / Consider / Avoid. |

**Visibility levels** (`services/views.js`): *public* sees vehicle type, available capacity, general cargo **category**, route, location and ETA;
a *confirmed customer* additionally sees their own cargo/booking; the *driver/admin* sees the full manifest.

**Booking flow:** customer requests (or driver offers) → the other side confirms (capacity is re-checked at that moment) → driver picks up (capacity drops) → driver delivers (capacity returns, earnings and 5% commission recorded) → customer rates.

### Project structure

```
server/src
  models/        User, Vehicle, Trip (with embedded cargo), Shipment, Booking
  services/      capacity, route, compat, profit, matching, views, cargoFlow
  routes/        auth, vehicles, trips, shipments (+ search), bookings, admin
  seed.js        demo data (the Eluru → Hyderabad example from the brief)
server/test      engine tests
client/src
  pages/         Home (search), Login, Customer, Driver, NewTrip, TripDetail, Admin
  components/    TruckCard, RouteMap (SVG), CapacityBar, ShipmentForm, ui
```

### Main API endpoints

| Endpoint | Who | Purpose |
| --- | --- | --- |
| `POST /api/auth/register`, `/login`, `GET /me` | all | JWT auth (bcrypt password hashing) |
| `GET /api/shipments/search/trucks` | public | ranked trucks for a shipment |
| `POST /api/shipments`, `GET /mine`, `GET /:id/matches` | customer | post & match shipments |
| `POST /api/bookings`, `/:id/cancel`, `/:id/confirm`, `/:id/rate` | customer | request, confirm a driver offer, rate |
| `POST /api/vehicles`; `POST /api/trips` | driver | add vehicle, plan trip (optionally with return trip) |
| `POST /api/trips/:id/start`, `PATCH /:id/location`, `POST /:id/cargo/:cid/pickup\|deliver`, `/complete`, `/return` | driver | run the trip |
| `GET /api/trips/:id/opportunities`, `POST /api/bookings/offer`, `/:id/accept`, `/:id/reject` | driver | find loads, offer, answer requests |
| `/api/admin/*` | admin | stats, verify/suspend users, trips, bookings |

---

## Honest limitations (say these before your guide asks)

* **GPS is simulated.** Location comes from the *Simulate driving* button through the same `PATCH /trips/:id/location` endpoint a phone's GPS would call. No hardware tracker or map provider is integrated.
* **Routes are straight lines between the stops the driver picks**, with a 1.25× factor to approximate road distance. Add intermediate cities for better accuracy (e.g. Guntur → *Suryapet* → Hyderabad). A real product would use a routing API (Google/OSRM) and road-network distances.
* **The city list is limited** (25 cities in AP/Telangana and nearby, `server/src/data/cities.js`). Add more rows to extend it.
* **No real payments.** Price, commission and driver payout are calculated and recorded; there is no payment gateway.
* **Finding loads is not new by itself.** Platforms like Vahak already offer part-load booking, vehicle filters and live tracking. Our angle is combining *visible live capacity + route-aware matching at intermediate stops + cargo visibility levels + profit estimate*.
* Cost rates (₹14/km detour, ₹2.5/km toll, 5% commission) are editable defaults, not market data.

## Ideas for later

Routing API and real map tiles, phone GPS (browser Geolocation API), payments (Razorpay), notifications (SMS/WhatsApp), document upload for driver verification, fleet dashboards and subscriptions.
