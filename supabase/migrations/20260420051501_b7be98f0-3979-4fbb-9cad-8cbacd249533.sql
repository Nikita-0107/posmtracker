-- Replace permissive insert policy on materials
drop policy if exists "Authenticated users can add materials" on public.materials;

create policy "Admins can add materials"
  on public.materials for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

-- Seed materials catalog
insert into public.materials (code, name) values
  ('M/27008019C9', 'GFK RED GPPL FAB 3L BB 590x635mm'),
  ('M/3927701900', 'GFK Red Range Honeycomb Board 12x16in'),
  ('M/1100510904', 'Classic Pack Acrylic CIS 24x8in'),
  ('M/3019501106', 'Classic Connect Styleup Alt PP Board 17x22in'),
  ('M/27005019A0', 'Classic Pack Fabric 3L BB 627x630mm'),
  ('M/3026901900', 'Gold Flake Fresh Range Alt PP Board 22x35in'),
  ('M/0127401101', 'Players DS Fruity PG Board 17x22in'),
  ('M/3027401901', 'Players DS Fruity Alt PP Board 22x35in'),
  ('M/0127401301', 'Players DS Fruity PG Board 8x11in'),
  ('M/27005019A3', 'Classic Pack Fabric 3L BB 12.5x16in'),
  ('M/3927401901', 'Players Fruity Honeycomb Board 12x16in'),
  ('M/0127801300', 'Gold Flake Blue Range PG Board 8x11in'),
  ('M/3802001903', 'Flake Premium Fabric Display 12.5x16in'),
  ('M/0127701300', 'Gold Flake Red Range PG Board 8x11in'),
  ('M/3802001902', 'Flake Premium Fabric Display 627x630mm'),
  ('M/0159901100', 'RWB Backing Sheet 17x22in'),
  ('M/27008019C8', 'GFK Red Fabric Board 627x630mm'),
  ('M/3126501900', 'Classic BT Shelf Strip 11.5x4.5in'),
  ('M/3027701101', 'GFK Red Range Alt PP Board 17x22in'),
  ('M/2719101949', 'Classic Balance Taste Fabric Board 895x635mm'),
  ('M/2719101948', 'Classic Balance Taste Fabric Board 627x630mm'),
  ('M/2719101947', 'Classic Balance Taste Fabric Board 590x635mm'),
  ('M/3027801101', 'GFK Blue Range Alt PP Board 17x22in'),
  ('M/3927801900', 'GFK Blue Honeycomb Board 12x16in'),
  ('M/3127701900', 'GFK Red Shelf Strip 11.5x4.5in'),
  ('M/3127801900', 'GFK Blue Shelf Strip 11.5x4.5in'),
  ('M/3026501102', 'Classic BT Alt PP Board 17x22in'),
  ('M/3926501900', 'Classic BT Honeycomb Board 12x16in'),
  ('M/27008019D15', 'GFK Red Fabric Board 850x670mm'),
  ('M/0128201300', 'AC Farlongs PG Board 8x11in'),
  ('M/0167002102', 'Maroon Red Backing Sheet 17x22in'),
  ('M/3028201101', 'AC Farlongs Alt PP Board 17x22in'),
  ('M/3928201900', 'AC Farlongs Honeycomb Board 12x16in'),
  ('M/0128201100', 'AC Farlongs PG Board 17x22in'),
  ('M/0111001302', 'Duke Special Telugu PG Board 8x11in')
on conflict (code) do nothing;

-- Seed CEVL opening stock
insert into public.stock (wsp, material_code, qty) values
  ('CEVL', 'M/27008019C9', 100),
  ('CEVL', 'M/3927701900', 973),
  ('CEVL', 'M/1100510904', 200),
  ('CEVL', 'M/3019501106', 500),
  ('CEVL', 'M/27005019A0', 14),
  ('CEVL', 'M/3026901900', 12),
  ('CEVL', 'M/0127401101', 2800),
  ('CEVL', 'M/3027401901', 1200),
  ('CEVL', 'M/0127401301', 4000),
  ('CEVL', 'M/27005019A3', 30),
  ('CEVL', 'M/3927401901', 1200),
  ('CEVL', 'M/0127801300', 174),
  ('CEVL', 'M/3802001903', 1800),
  ('CEVL', 'M/0127701300', 108),
  ('CEVL', 'M/3802001902', 180),
  ('CEVL', 'M/0159901100', 12144),
  ('CEVL', 'M/27008019C8', 310),
  ('CEVL', 'M/3126501900', 87),
  ('CEVL', 'M/3027701101', 107),
  ('CEVL', 'M/2719101949', 2),
  ('CEVL', 'M/2719101948', 64),
  ('CEVL', 'M/2719101947', 20),
  ('CEVL', 'M/3027801101', 107),
  ('CEVL', 'M/3927801900', 76),
  ('CEVL', 'M/3127701900', 46),
  ('CEVL', 'M/3127801900', 46),
  ('CEVL', 'M/3026501102', 52),
  ('CEVL', 'M/3926501900', 44),
  ('CEVL', 'M/27008019D15', 10),
  ('CEVL', 'M/0128201300', 13494),
  ('CEVL', 'M/0167002102', 2260),
  ('CEVL', 'M/3028201101', 2699),
  ('CEVL', 'M/3928201900', 2035),
  ('CEVL', 'M/0128201100', 3936),
  ('CEVL', 'M/0111001302', 30000)
on conflict (wsp, material_code) do nothing;

-- Seed CEVJ and CEVY with zeros for all materials
insert into public.stock (wsp, material_code, qty)
select 'CEVJ'::public.wsp_code, code, 0 from public.materials
on conflict (wsp, material_code) do nothing;

insert into public.stock (wsp, material_code, qty)
select 'CEVY'::public.wsp_code, code, 0 from public.materials
on conflict (wsp, material_code) do nothing;