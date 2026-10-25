/*
  ShiftMe website settings
  ------------------------
  This is the ONE file you edit to change prices, contact details and booking rules.
  Save it on GitHub and the live site updates in about a minute.
*/
window.SHIFTME_CONFIG = {

  // Paste your Google Apps Script web app URL here (see SETUP-GUIDE.md, Part 1).
  // While this is empty the site runs in preview mode and bookings are NOT saved.
  API_URL: "https://script.google.com/macros/s/AKfycbzFFjS5zMntLnX_prOcPUK3y825_Z6nIXnvHul6JsGnPDHC2ipRx0CuaTTMKz5-vqEkvg/exec",

  // Booking rules
  MAX_BOOKINGS_PER_DAY: 2,     // a date is blocked automatically once it has this many bookings
  MIN_NOTICE_DAYS: 1,          // 1 = customers can book from tomorrow onwards
  BOOK_AHEAD_DAYS: 120,        // how far ahead the calendar goes
  CLOSED_WEEKDAYS: [],         // e.g. [0] closes Sundays. 0 Sun, 1 Mon ... 6 Sat

  // Arrival slots. Each slot can be taken once per day.
  // "days" lists the weekdays a slot is offered: 0 Sun, 1 Mon ... 6 Sat. Leave it out to offer it every day.
  SLOTS: [
    { id: "morning",   label: "Morning",   time: "9am start" },
    { id: "afternoon", label: "Afternoon", time: "1pm start", days: [1, 2, 3, 4, 5, 6] }   // not Sundays (we close at 1pm)
  ],

  // Contact details
  PHONE_DISPLAY: "020 3488 8610",
  PHONE_LINK: "+442034888610",
  WHATSAPP: "447457411586",
  EMAIL: "shiftmeinfo@gmail.com",
  INSTAGRAM: "shiftmeuk",
  HOURS: "Monday to Saturday 9am to 5:30pm, Sunday 9am to 1pm",

  // Packages. Change a price here and it updates everywhere on the site.
  PACKAGES: [
    { id: "f1", group: "flat",  size: 1, name: "1 bedroom flat",  price: 325, load: 3,
      items: ["Bed and mattress", "Wardrobe", "Chest of drawers", "2 bedside tables", "Bookcase", "Coffee table", "TV and stand", "2 seater sofa", "2 dining chairs", "Up to 5 large and 5 medium boxes", "1 suitcase"] },
    { id: "f2", group: "flat",  size: 2, name: "2 bedroom flat",  price: 475, load: 5,
      items: ["Double bed and king bed with mattresses", "Double wardrobe and 2 wardrobes", "Chest of drawers", "3 bedside tables", "Microwave", "Fridge freezer", "4 seater dining table and 4 chairs", "Bookcase", "Coffee table", "TV and stand", "3 seater sofa", "Up to 15 large and 10 medium boxes", "2 suitcases"] },
    { id: "f3", group: "flat",  size: 3, name: "3 bedroom flat",  price: 650, load: 7,
      items: ["3 double beds with mattresses", "4 bedside tables", "Chest of drawers", "2 double wardrobes", "Microwave", "Fridge freezer", "6 seater dining table and 6 chairs", "Coffee table", "TV and stand", "3 seater sofa", "Up to 25 large and 10 medium boxes", "3 suitcases"] },

    { id: "h1", group: "house", size: 1, name: "1 bedroom house", price: 375, load: 4,
      items: ["Bed and mattress", "Wardrobe", "Chest of drawers", "2 bedside tables", "Bookcase", "Coffee table", "Kitchen table and 2 chairs", "Washing machine", "TV and stand", "2 seater sofa", "Armchair", "Up to 8 large and 5 medium boxes", "1 suitcase"] },
    { id: "h2", group: "house", size: 2, name: "2 bedroom house", price: 525, load: 6,
      items: ["Double bed and single bed with mattresses", "2 wardrobes", "Chest of drawers", "3 bedside tables", "Kitchen table and 4 chairs", "Washing machine", "Fridge freezer", "Microwave", "Bookcase", "Coffee table", "TV and stand", "3 seater sofa", "Armchair", "Up to 18 large and 10 medium boxes", "2 suitcases"] },
    { id: "h3", group: "house", size: 3, name: "3 bedroom house", price: 725, load: 8,
      items: ["3 double beds with mattresses", "4 bedside tables", "2 double wardrobes", "Chest of drawers", "Kitchen table and 6 chairs", "Washing machine", "Fridge freezer", "Microwave", "Coffee table", "TV and stand", "3 seater sofa", "Armchair", "Up to 28 large and 10 medium boxes", "3 suitcases"] },
    { id: "h4", group: "house", size: 4, name: "4 bedroom house", price: 950, load: 10,
      items: ["King size bed and 3 double beds with mattresses", "5 bedside tables", "2 double wardrobes and 2 wardrobes", "Chest of drawers", "Kitchen table and 6 chairs", "Washing machine", "Fridge freezer", "Microwave", "Coffee table", "TV and stand", "3 seater sofa", "Armchair", "Up to 35 large and 15 medium boxes", "4 suitcases"] },

    { id: "s1", group: "small", size: 1, name: "Small move, 1 mover",  price: 83,  load: 1,
      items: ["A few items or a single piece of furniture", "One mover and the van", "Call out charge, final price confirmed before the day"] },
    { id: "s2", group: "small", size: 2, name: "Small move, 2 movers", price: 124.5, load: 2,
      items: ["Heavier or bulky items like sofas and fridges", "Two movers and the van", "Call out charge, final price confirmed before the day"] }
  ],

  // Add ons customers can pick when booking.
  // per: "item" lets them choose a quantity, "hour" is charged per hour with a minimum.
  ADDONS: [
    { id: "dismantle",  name: "Dismantling service",            price: 40, per: "once", note: "Furniture taken apart before the move" },
    { id: "assembly",   name: "Assembly service",               price: 40, per: "once", note: "Furniture rebuilt at your new home" },
    { id: "packing",    name: "Packing service",                price: 40, per: "hour", min: 2, note: "£40 an hour, 2 hour minimum" },
    { id: "materials",  name: "Packaging materials",            price: 25, per: "once", note: "Boxes, tape and wrapping" },
    { id: "unpacking",  name: "Unpacking service",              price: 25, per: "once", note: "We unpack your boxes at the new place" },
    { id: "bed",        name: "Bed dismantle and reassemble",   price: 45, per: "item", note: "Per bed" },
    { id: "kingbed",    name: "King size bed",                  price: 60, per: "item", note: "Dismantle and reassemble" },
    { id: "wardrobe",   name: "Standard wardrobe",              price: 55, per: "item", note: "Dismantle and reassemble" },
    { id: "bigwardrobe",name: "Large or double wardrobe",       price: 70, per: "item", note: "Dismantle and reassemble" },
    { id: "table",      name: "Dining table",                   price: 35, per: "item", note: "Dismantle and reassemble" },
    { id: "otherlarge", name: "Other large furniture",          price: 45, per: "item", note: "Dismantle and reassemble" },
    { id: "labour",     name: "Extra labour",                   price: 45, per: "hour", min: 1, note: "£45 an hour for extra item work" },
    { id: "waiting",    name: "2 hours waiting time",           price: 70, per: "item", note: "If you need us to wait on the day" }
  ],

  // Shown under pricing for transparency, not selectable.
  OTHER_CHARGES: [
    { name: "Late arrival fee", price: 25, note: "Applies for arrivals 1 to 30 minutes late" }
  ]
};
