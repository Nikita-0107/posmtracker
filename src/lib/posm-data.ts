export const distributors = [
  "SRINIDHI ASSOCIATES – KAKINADA",
  "SRI VENKATA SAI LAKSHMI AGENCIES – RAMACHANDRAPURAM",
  "SATYANARAYANA AGENCIES – PARAVATHIPURAM",
  "SRI KALYANI AGENCIES – VIZAG-KALYANI",
  "SRI VEERABHADRA AGENCIES – SAMALKOT",
  "PASUMARTHY BANGARIAH CHETTY AGENCIES – CHODAVARAM",
  "SAI VENKATA NARASIMHA ENTERPRISES – MADHURAWADA",
  "SRI PADMA AGENCIES – YELESWARAM",
  "VASAVI AGENCIES – TUNI",
  "SREE DURGA ENTERPRISES – MANDAPETA",
  "SRI BALAJI AGENCIES – KOTTURU",
  "ARUNDHATHI ENTERPRISES – KURUPAM",
  "S V TANMAYEE AGENCIES – PEDDAPURAM",
  "VENKATA MANIKANTHA AGENCIES – NARSANNAPETA",
  "PAVANI ENTERPRISES – VIZAG",
  "SRI LAKSHMI SRIYAN ENTERPRISES – BOBBILI",
  "RAJESH ENTERPRISES – ELAMANCHILI",
  "SRI NIKSHITHA ENTERPRISES – VIZIANAGARAM",
  "SRI SURYA TRADERS – SRIKAKULAM",
  "SREE VAISHNAVI TRADERS – VEPAGUNTA",
  "SAI GANAPATHI ENTERPRISES – SRIKAKULAM",
  "SRI SRINIVASA AGENCY – ICHCHAPURAM",
  "SRI VENKATA SAI ENTERPRISES – RAJAM",
  "SRI VISHNU AGENCY – SALUR",
  "SRI DEVAKI LOGISTICS – KAKINADA",
  "SURYA MARKETING – VIZAG-SURYA",
  "SRI LALITHA AGENCIES – ANAPARTHI",
  "SRI KARTHIKEYA ENTERPRISES – PALAKONDA",
  "SRI SIDHI VINAYAKA AGENCY – YANAM",
  "MAHADEV ENTERPRISES – TEKKALI",
  "SRI SRINIVASA ENTERPRISES – RANASTALAM",
  "PIONEER MARKETING – TAGARAPUVALASA",
  "SRI VENKATA SAI ABHAYA ANJANEYA TRADERS – ANAKAPALLI",
  "VENKATA GANGA DURGA AGENCIES – NARSIPATNAM",
  "SRI LAKSHMI AGENCIES – PITHAPURAM",
  "SRI VENKATESWARA AGENCIES – NARSIPATNAM",
  "BARAKAT AGENCIES – PADERU",
  "BANDARU VENKATA RAMANA & SONS – SRUNGAVARAPUKOTA",
  "SRI TIRUMALA TRADERS – PALASA",
  "CMK ASSOCIATES – VIZAG-CMK",
  "ARUNODAYA ASSOCIATES – VIZIANAGARAM",
  "VASUDAH ASSOCIATES – VIZAG-VASUDAH",
] as const;

export type PosmMaterial = { code: string; name: string };

export const posmMaterials: PosmMaterial[] = [
  { code: "M/27008019C9", name: "GFK RED GPPL FAB 3L BB 590x635mm" },
  { code: "M/3927701900", name: "GFK Red Range Honeycomb Board 12x16in" },
  { code: "M/1100510904", name: "Classic Pack Acrylic CIS 24x8in" },
  { code: "M/3019501106", name: "Classic Connect Styleup Alt PP Board 17x22in" },
  { code: "M/27005019A0", name: "Classic Pack Fabric 3L BB 627x630mm" },
  { code: "M/3026901900", name: "Gold Flake Fresh Range Alt PP Board 22x35in" },
  { code: "M/0127401101", name: "Players DS Fruity PG Board 17x22in" },
  { code: "M/3027401901", name: "Players DS Fruity Alt PP Board 22x35in" },
  { code: "M/0127401301", name: "Players DS Fruity PG Board 8x11in" },
  { code: "M/27005019A3", name: "Classic Pack Fabric 3L BB 12.5x16in" },
  { code: "M/3927401901", name: "Players Fruity Honeycomb Board 12x16in" },
  { code: "M/0127801300", name: "Gold Flake Blue Range PG Board 8x11in" },
  { code: "M/3802001903", name: "Flake Premium Fabric Display 12.5x16in" },
  { code: "M/0127701300", name: "Gold Flake Red Range PG Board 8x11in" },
  { code: "M/3802001902", name: "Flake Premium Fabric Display 627x630mm" },
  { code: "M/0159901100", name: "RWB Backing Sheet 17x22in" },
  { code: "M/27008019C8", name: "GFK Red Fabric Board 627x630mm" },
  { code: "M/3126501900", name: "Classic BT Shelf Strip 11.5x4.5in" },
  { code: "M/3027701101", name: "GFK Red Range Alt PP Board 17x22in" },
  { code: "M/2719101949", name: "Classic Balance Taste Fabric Board 895x635mm" },
  { code: "M/2719101948", name: "Classic Balance Taste Fabric Board 627x630mm" },
  { code: "M/2719101947", name: "Classic Balance Taste Fabric Board 590x635mm" },
  { code: "M/3027801101", name: "GFK Blue Range Alt PP Board 17x22in" },
  { code: "M/3927801900", name: "GFK Blue Honeycomb Board 12x16in" },
  { code: "M/3127701900", name: "GFK Red Shelf Strip 11.5x4.5in" },
  { code: "M/3127801900", name: "GFK Blue Shelf Strip 11.5x4.5in" },
  { code: "M/3026501102", name: "Classic BT Alt PP Board 17x22in" },
  { code: "M/3926501900", name: "Classic BT Honeycomb Board 12x16in" },
  { code: "M/27008019D15", name: "GFK Red Fabric Board 850x670mm" },
  { code: "M/0128201300", name: "AC Farlongs PG Board 8x11in" },
  { code: "M/0167002102", name: "Maroon Red Backing Sheet 17x22in" },
  { code: "M/3028201101", name: "AC Farlongs Alt PP Board 17x22in" },
  { code: "M/3928201900", name: "AC Farlongs Honeycomb Board 12x16in" },
  { code: "M/0128201100", name: "AC Farlongs PG Board 17x22in" },
  { code: "M/0111001302", name: "Duke Special Telugu PG Board 8x11in" },
];

export const teamLeaders = [
  "Ravi Kumar",
  "Suresh",
  "Naidu",
] as const;

export const initialStock: Record<string, number> = {
  "M/3927701900": 500,
  "M/3126501900": 300,
  "M/0159901100": 200,
};

export function addMaterial(code: string, name: string): PosmMaterial | null {
  const trimmedCode = code.trim().toUpperCase();
  const trimmedName = name.trim();
  if (!trimmedCode || !trimmedName) return null;
  if (posmMaterials.some((m) => m.code === trimmedCode)) {
    return posmMaterials.find((m) => m.code === trimmedCode) ?? null;
  }
  const material = { code: trimmedCode, name: trimmedName };
  posmMaterials.push(material);
  if (!(trimmedCode in initialStock)) {
    initialStock[trimmedCode] = 0;
  }
  return material;
}
