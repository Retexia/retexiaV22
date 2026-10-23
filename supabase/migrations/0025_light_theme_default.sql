-- =====================================================================
-- 0025: Light by default everywhere. The site no longer follows the
-- device's light/dark setting: it starts light, and visitors switch to
-- dark themselves (the choice is remembered in their browser).
-- default_theme is now 'light' or 'dark'; a saved 'system' becomes 'light'.
-- Safe to run again. Run after 0024.
-- =====================================================================

update public.site_settings set default_theme = 'light' where default_theme not in ('light', 'dark');
alter table public.site_settings alter column default_theme set default 'light';
alter table public.site_settings drop constraint if exists site_settings_default_theme_check;
alter table public.site_settings add constraint site_settings_default_theme_check check (default_theme in ('light', 'dark'));
comment on column public.site_settings.default_theme is 'light or dark: how the site starts. Visitors can still switch.';
