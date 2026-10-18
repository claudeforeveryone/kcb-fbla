-- The site is now FBLC United: emails go out under that name.
update fbla_private.email_config set value = 'FBLC United <onboarding@resend.dev>' where key = 'email_from';
