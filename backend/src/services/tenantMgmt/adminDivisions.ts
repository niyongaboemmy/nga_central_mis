/**
 * Rwanda administrative divisions for the register wizard (plan §6.1 step 1):
 * province -> district -> sectors. All 5 provinces and 30 districts; sectors
 * are listed for a few districts only -- the UI falls back to free text when a
 * district's list is empty.
 */
export const RWANDA_ADMIN_DIVISIONS: Record<string, Record<string, string[]>> = {
  "Kigali City": {
    Gasabo: [
      "Bumbogo", "Gatsata", "Gikomero", "Gisozi", "Jabana", "Jali", "Kacyiru", "Kimihurura",
      "Kimironko", "Kinyinya", "Ndera", "Nduba", "Remera", "Rusororo", "Rutunga",
    ],
    Kicukiro: ["Gahanga", "Gatenga", "Gikondo", "Kagarama", "Kanombe", "Kicukiro", "Kigarama", "Masaka", "Niboye", "Nyarugunga"],
    Nyarugenge: ["Gitega", "Kanyinya", "Kigali", "Kimisagara", "Mageragere", "Muhima", "Nyakabanda", "Nyamirambo", "Nyarugenge", "Rwezamenyo"],
  },
  "Northern Province": {
    Burera: [],
    Gakenke: [],
    Gicumbi: [],
    Musanze: [
      "Busogo", "Cyuve", "Gacaca", "Gashaki", "Gataraga", "Kimonyi", "Kinigi", "Muhoza",
      "Muko", "Musanze", "Nkotsi", "Nyange", "Remera", "Rwaza", "Shingiro",
    ],
    Rulindo: [],
  },
  "Southern Province": {
    Gisagara: [],
    Huye: [
      "Gishamvu", "Huye", "Karama", "Kigoma", "Kinazi", "Maraba", "Mbazi", "Mukura",
      "Ngoma", "Ruhashya", "Rusatira", "Rwaniro", "Simbi", "Tumba",
    ],
    Kamonyi: [],
    Muhanga: [],
    Nyamagabe: [],
    Nyanza: [],
    Nyaruguru: [],
    Ruhango: [],
  },
  "Eastern Province": {
    Bugesera: [],
    Gatsibo: [],
    Kayonza: [],
    Kirehe: [],
    Ngoma: [],
    Nyagatare: [],
    Rwamagana: [
      "Fumbwe", "Gahengeri", "Gishali", "Karenge", "Kigabiro", "Muhazi", "Munyaga",
      "Munyiginya", "Musha", "Muyumbu", "Mwulire", "Nyakaliro", "Nzige", "Rubona",
    ],
  },
  "Western Province": {
    Karongi: [],
    Ngororero: [],
    Nyabihu: [],
    Nyamasheke: [],
    Rubavu: ["Bugeshi", "Busasamana", "Cyanzarwe", "Gisenyi", "Kanama", "Kanzenze", "Mudende", "Nyakiliba", "Nyamyumba", "Nyundo", "Rubavu", "Rugerero"],
    Rusizi: [],
    Rutsiro: [],
  },
};
