export const DEFAULT_AI_INSTRUCTIONS =
`INCOME:
- Salary / payroll deposits (PAYROLL, เงินเดือน, ค่าจ้าง) → category: "Salary"
- Bonus payments → category: "Bonus"
- Freelance or ad-hoc transfers in from individuals → category: "Freelance Income"
- Interest credited by bank → category: "Interest"

EXPENSES — map descriptions to these categories:
- Restaurants, cafes, food delivery (Grab Food, LINE MAN, Foodpanda, Robinhood) → "Food & Dining"
- Grab taxi, Bolt, BTS, MRT, fuel stations (PTT, Shell, Bangchak, Esso) → "Transport"
- Supermarkets & convenience stores (Makro, Tops, Big C, Lotus's, 7-Eleven, FamilyMart) → "Groceries"
- Hospitals, clinics, pharmacies, dental → "Healthcare"
- Utilities: electricity (MEA/PEA), water (MWA), internet, mobile top-up (AIS, DTAC, True, NT) → "Utilities"
- Streaming & app subscriptions (Netflix, Spotify, Apple, Disney+, YouTube, LINE TV, Claude.ai) → "Subscriptions"
- Online / retail shopping (Shopee, Lazada, fashion, electronics) → "Shopping"
- Hotels, airlines, travel agencies, Agoda, Booking.com → "Travel"
- Gym memberships, sports equipment → "Health & Fitness"
- Insurance premiums (life, health, car) → "Insurance"
- Education, courses, tuition → "Education"
- Coffee shops (Starbucks, Cafe Amazon, Black Canyon) → "Coffee"
- Beauty & personal care (salons, spas, skincare) → "Personal Care"

TRANSFERS & SPECIAL TYPES:
- Credit card bill payments (ชำระบัตรเครดิต, CC PAYMENT, VISA PAYMENT) → tx_type: "cc_payment"
- Transfers between own accounts at the same bank → tx_type: "transfer"
- PromptPay / bank transfers to/from known family members or self → tx_type: "transfer"
- Anything unrecognised → category: "Other"`;
