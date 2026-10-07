-- StopSpotter — route the Support page's quick options into the email
-- capture flow, so a "I'd support a crowdfund" etc. tap is actually
-- someone Jamie can follow up with, not an anonymous row.
alter table public.growth_feedback add column email text;

-- New funnel event for the admin analytics summary (see 0004_analytics.sql) —
-- lets Jamie see how many Support-page taps actually convert to a captured
-- email, same as nomination_submit/vote_submit already do for those flows.
alter table public.analytics_events
drop constraint analytics_events_event_type_check;

alter table public.analytics_events
add constraint analytics_events_event_type_check check (
  event_type in (
    'pageview',
    'share_click',
    'nomination_submit',
    'vote_submit',
    'growth_feedback_submit'
  )
);
