-- KCB FBLA shares orbit's auth. Its sign-ups carry raw_user_meta_data.app = 'kcb-fbla' and should not get
-- orbit's personal defaults (routines, exercises, notification prefs). Adds one guard line to orbit's
-- seed_user_defaults(); nothing else changes. To undo: remove the "if new.raw_user_meta_data ->> 'app'" line.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.seed_user_defaults'::regproc);
  if position('kcb-fbla' in def) = 0 then
    def := regexp_replace(def, E'\nbegin\n', E'\nbegin\n  if new.raw_user_meta_data ->> ''app'' = ''kcb-fbla'' then return new; end if;\n', '');
    execute def;
  end if;
end $$;
