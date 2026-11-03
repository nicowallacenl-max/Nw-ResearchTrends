-- New procedure "Panel" between Strip and Repair. The unlock chain follows the enum order
-- (procedure_order = position in the enum), so lines now unlock Strip -> Panel -> Repair -> Prep -> Paint -> Refit.
-- (Kept on its own: a new enum value can't be used in the same transaction that adds it.)
alter type public.procedure_type add value if not exists 'panel' before 'repair';
