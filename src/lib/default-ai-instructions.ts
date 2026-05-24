export const DEFAULT_AI_INSTRUCTIONS =
`INCOME — when direction=credit:
- Salary / payroll deposits (PAYROLL, เงินเดือน, ค่าจ้าง, SALARY) → category: "Salary"
- Bonus, annual bonus, performance bonus → category: "Bonus"
- Freelance or ad-hoc transfers in from individuals → category: "Freelance Income"
- Interest credited by bank (ดอกเบี้ย, INTEREST) → category: "Interest"
- Cashback, rebate credited by bank or card → category: "Cashback"
- Refunds from merchants or travel cancellations → category: "Reimbursement"

EXPENSES — map descriptions to these categories:

Food & Dining (restaurants, cafes, food delivery):
- Grab Food, GrabFood, LINE MAN, Lineman, LINEMAN, Foodpanda, Robinhood → "Food & Dining"
- MK Restaurant, MK SUKI, Sizzler, Swensen's, The Pizza Company, Pizza Hut, Domino's → "Food & Dining"
- McDonald's, KFC, Burger King, Subway, Bonchon, Popeyes → "Food & Dining"
- Haidilao, Hai Di Lao, Shabu Indy, Suki, Shabushi → "Food & Dining"
- Oishi, Fuji, Zen, After You, Red Lobster, Somtum Der → "Food & Dining"
- Any restaurant, ร้านอาหาร, food, อาหาร → "Food & Dining"

Coffee shops:
- Starbucks, STARBUCKS → "Coffee"
- Cafe Amazon, CAFE AMAZON, CafeAmazon → "Coffee"
- Black Canyon, BLACK CANYON → "Coffee"
- Doi Chaang, DOI CHAANG, True Coffee, Kamu Tea, Cha Tra Mue (ชาตรามือ) → "Coffee"
- Pacamara, 9th Street Coffee, % Arabica, Roots Coffee → "Coffee"

Transport:
- Grab (GrabCar, GrabBike, GrabExpress, GrabTaxi), GRAB → "Transport"
- Bolt, inDrive, MaxTaxi → "Transport"
- BTS SkyTrain, BTS, MRT, รถไฟฟ้า, Airport Rail Link, ARL → "Transport"
- Fuel stations: PTT, Shell, Bangchak, Esso, Caltex, Susco → "Transport"
- Parking, car park, จอดรถ → "Transport"
- Tollway, expressway, ทางด่วน → "Transport"

Groceries & supermarkets:
- Makro, Tops Market, TOPS, Big C, Lotus's, Tesco → "Groceries"
- 7-Eleven, 7-11, FamilyMart, Lawson, CJ Express → "Groceries"
- Villa Market, Gourmet Market, Foodland, UFM → "Groceries"
- Rimping Supermarket, Friendship Supermarket → "Groceries"

Healthcare:
- Hospitals: Bumrungrad, Bangkok Hospital, Samitivej, BNH, Vejthani, Bangkok Dusit (BDMS) → "Healthcare"
- Phyathai, Paolo, Vibhavadi, Sikarin Hospital → "Healthcare"
- Clinics, pharmacy, ร้านขายยา, Fascino Clinic, แพทย์ → "Healthcare"
- Dental, dentist, ทันตแพทย์, Boots Pharmacy → "Healthcare"

Utilities & bills:
- MEA, PEA, การไฟฟ้า (electricity) → "Utilities"
- MWA, การประปา (water) → "Utilities"
- AIS, DTAC, True Move, NTTD, NT, CAT (mobile / internet) → "Utilities"
- Three BB, TOT, NTPLC, 3BB, Jasmine broadband → "Utilities"
- LINE TV, True Visions (cable) → "Utilities"

Subscriptions:
- Netflix, NETFLIX, Spotify, Apple (App Store / iCloud / Apple TV), Disney+, HBO → "Subscriptions"
- YouTube Premium, Google, Amazon Prime → "Subscriptions"
- Claude.ai, Anthropic, ChatGPT, OpenAI → "Subscriptions"
- Adobe, Figma, Notion, Dropbox, LINE MUSIC → "Subscriptions"

Shopping (online & retail):
- Shopee, Lazada, JD Central, Temu → "Shopping"
- Central, The Mall, ONESIAM, IconSiam, Terminal 21, EmQuartier, Emporium, Siam Paragon → "Shopping"
- IKEA, HomePro, Global House, Thai Watsadu → "Shopping"
- Uniqlo, Zara, H&M, Muji, Nike, Adidas → "Shopping"
- iStudio, Apple Store, Power Buy → "Shopping"

Travel:
- Hotels, airline (Thai Airways, Bangkok Airways, AirAsia, Nok Air, Lion Air, Scoot) → "Travel"
- Agoda, Booking.com, Airbnb, Expedia, Klook → "Travel"
- Travel agency, tour, ท่องเที่ยว → "Travel"

Health & Fitness:
- Fitness First, Virgin Active, FitD, Jetts, Anytime Fitness, RSportsclub → "Health & Fitness"
- Muay Thai, yoga studio, swimming pool, สระว่ายน้ำ → "Health & Fitness"

Insurance:
- Life, health, car, travel insurance premiums (AIA, Muang Thai, Krungthai-AXA, FWD, Generali, Allianz) → "Insurance"
- ประกัน, เบี้ยประกัน → "Insurance"

Education:
- Tuition, university, school fees, courses (Coursera, Udemy) → "Education"
- ค่าเล่าเรียน, ค่าสมัคร → "Education"

Personal Care:
- Salons, spas, barber, hair, nail → "Personal Care"
- Watsons, Boots (when not pharmacy context), skincare → "Personal Care"

TRANSFERS & SPECIAL TYPES:
- Credit card bill payments (ชำระบัตรเครดิต, CC PAYMENT, VISA PAYMENT, MASTERCARD PAYMENT, JCB PAYMENT) → tx_type: "cc_payment"
- Transfers between own accounts at the same bank or PromptPay to self → tx_type: "transfer"
- PromptPay / bank transfers to/from known family members → tx_type: "transfer"
- Anything unrecognised → category: "Other"`;
