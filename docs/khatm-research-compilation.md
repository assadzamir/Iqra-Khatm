# Khatm Feature — Comprehensive Research Compilation

**Compiled:** 2026-04-04  
**Scope:** All references to Khatm, Group Khatm, Juz assignment, collective reading, WhatsApp notifications, Supabase tables, and React Native screens across all known project directories.

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Technical Decisions Made](#2-technical-decisions-made)
3. [Database Schema](#3-database-schema)
4. [UI/UX Screens Designed](#4-uiux-screens-designed)
5. [Known Issues / What Was Left Incomplete](#5-known-issues--what-was-left-incomplete)
6. [Lessons Learned Relevant to Khatm](#6-lessons-learned-relevant-to-khatm)
7. [External Dependencies Used](#7-external-dependencies-used)

---

## 1. Feature Overview

### What Is Group Khatm?

Group Khatm is a collaborative Quran completion feature. A **Khatm** is the practice of reading the entire Quran (30 Juz) as a group, with each participant assigned specific Juz to read. The feature coordinates the assignment of Juz to participants, tracks individual and collective progress, sends WhatsApp/SMS/Email/Push notifications to keep everyone on track, and celebrates group completion.

### Two Separate Projects Found

**Project 1: Production Monorepo**
- **Path:** `c:\Users\zamir\OneDrive\Desktop\Group-khatm\`
- **Type:** Full-stack pnpm/Turborepo monorepo
- **Status:** Fully implemented with Supabase backend, Twilio notifications, RLS policies, audit trail
- **Apps:** React Native (Expo) mobile app + Next.js web app
- **Backend:** Supabase Postgres + Edge Functions (Deno)

**Project 2: Expo/React Native Prototype**
- **Path:** `c:\Users\zamir\OneDrive\Desktop\Project Code\group-khatm\`
- **Type:** Standalone Expo app with mock data (no Supabase connection)
- **Status:** Prototype/mockup for UI exploration
- **Has:** CLAUDE.md documenting the broader Islamic super-app project identity

**Current Working Directory (Iqra-Khatm):**
- **Path:** `c:\Users\zamir\OneDrive\Desktop\Iqra-Khatm\`
- **Status:** Empty at time of compilation — new project directory

### CLAUDE.md Project Context (from Prototype)

The prototype's CLAUDE.md (`c:\Users\zamir\OneDrive\Desktop\Project Code\group-khatm\CLAUDE.md`) establishes the broader project context:

```
Project Identity: An AI-powered Islamic super-app targeting the global Muslim community.
Four pillars:
1. Islamic AI Chatbot — grounded in authenticated scholarship
2. Quran Recitation & Memorization (HifzAI) — AI tajweed correction, hifz tracking
3. Filtered Islamic Video Gateway — halal-curated content
4. Muslim Life Hub — prayer times, Hijri calendar, qibla, zakat, fasting

Stage: Fully built, pre-launch, pre-seed fundraising
Founder: Non-technical solo founder (Windows dev environment, iPhone testing)

Tech Stack:
| Mobile       | React Native + Expo SDK 52+                          |
| Web          | Next.js 14 (App Router)                              |
| Backend      | Supabase (Postgres + Auth + Storage + Realtime)      |
| Monorepo     | Turborepo                                            |
| State        | Zustand + persist middleware                         |
| SMS/OTP      | Twilio                                               |
| AI           | Anthropic Claude API (claude-sonnet-4-20250514)      |
| Build        | EAS cloud builds                                     |
| Styling      | NativeWind + custom design tokens                    |

Key IDs:
- Expo account: zamirassad
- EAS project ID: 4d0a0f42-8804-4fba-90d9-d5300937dd0b
- Bundle ID: com.zamirassad.groupkhatmv2

Critical Pitfalls (Learned):
1. Zustand without persist — progress data resets on restart. Always use persist middleware.
2. RTL text — textAlign: 'right' alone is insufficient. Also set writingDirection: 'rtl'.
3. EAS on Windows — Always use cloud builds (eas build), never local builds.
4. Supabase RLS — Every new table needs Row Level Security enabled with written policies.
5. Prayer calculations — Different madhabs use different Fajr/Isha angles. Expose as a user setting.
6. Quran audio — Stream from Supabase Storage or CDN. Never bundle large audio files.
```

### Core Business Logic

1. An admin creates a Khatm group with a title, niyyah (Islamic intention), occasion type, target date, and assignment mode.
2. The admin invites participants via WhatsApp/SMS/Email using an 8-character invite code.
3. Participants join via the web form (`/join/:invite_code`) — no app required to join.
4. Juz 1–30 are assigned to participants (manually by admin, auto by system, or self-selected).
5. Participants update their progress (0–100%) from the mobile app.
6. The system sends automated notifications at key thresholds (stalls, deadlines, completions).
7. When all 30 Juz reach 100%, the group is marked COMPLETED and all members are notified.

---

## 2. Technical Decisions Made

### 2.1 Data Model Decisions

**ONE ROW PER PERSON PER JUZ (composite key)**  
`juz_assignments` uses a unique constraint `(group_id, participant_id, juz_number)`. This enforces that each person can only be assigned a given Juz once per group. Multiple people can read the same Juz when `allow_multi_per_juz = true`.

**Contact Token Over User ID**  
Participants can join via the web without creating an app account. A 32-character `contact_token` (derived from `crypto.randomUUID().replace(/-/g, '')`) identifies web participants instead of `auth.uid()`. The `user_id` field is nullable — web-only participants have no Supabase Auth user.

**Immutable Progress Ledger**  
Every progress update is recorded in `progress_updates` as an insert-only ledger (no updates, no deletes). The current state lives in `juz_assignments.progress_percent`; the full history lives in `progress_updates`. This makes auditing and dispute resolution possible.

**Notification Deduplication by Unique Constraint**  
`notifications` table has `UNIQUE (recipient_participant_id, notification_type, channel)`. The scheduler uses upsert with `onConflict: 'recipient_participant_id,notification_type,channel', ignoreDuplicates: true`. This prevents the same notification type from being sent twice to the same person on the same channel (regardless of time).

**AVAILABLE Status Does Not Exist as Rows**  
There is no row in `juz_assignments` for an open/available Juz. Absence of a row means the Juz is open. Only actual assignments have rows. This was a bug in early code that searched for `status = 'AVAILABLE'` rows.

**Auto-Assign Logic**  
- Counts all rows with status in `['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'RESERVED']`
- If `allow_multi_per_juz = false`: max 1 assignee per Juz
- If `allow_multi_per_juz = true`: max 2 assignees per Juz
- Returns the first available Juz number (lowest number first)
- Returns `null` if all Juz are full (admin must handle)

### 2.2 Architecture Decisions

**Monorepo with Turborepo + pnpm workspaces**  
Three packages: `apps/mobile`, `apps/web`, `packages/shared`. TypeScript types and constants are shared via the `group-khatm-shared` package.

**Zustand + MMKV for Active Khatm Context**  
The currently-selected Khatm is stored in a Zustand store backed by MMKV (faster and synchronous vs. AsyncStorage). Key: `active-khatm-storage`. All screens read `activeKhatm` from this store — switching it triggers re-renders app-wide. This is the Multi-Khatm Hub mechanism.

**TanStack Query (React Query) for Data Fetching**  
All Supabase reads go through React Query hooks in `useKhatm.ts`. `staleTime: 30_000` on `useMyKhatms`. Mutations invalidate relevant query keys. Query keys are centralized in the `QK` object.

**Supabase Realtime for Live Juz Grid**  
`useJuzGridRealtime(groupId)` subscribes to `postgres_changes` on `juz_assignments` filtered by `group_id`. On any change, invalidates `QK.juzGrid` and `QK.myKhatms`. Called from `HomeScreen` and `ParticipantScreen`. Uses `supabase.removeChannel(channel)` on unmount.

**Supabase Edge Functions (Deno) for Server Logic**  
Two primary Edge Functions:
1. `invite-handler` — handles web join flow (POST `/functions/v1/invite-handler`)
2. `notification-scheduler` — runs all notification checks + queue processing (called hourly)

Both pin `@supabase/supabase-js@2.39.3` to prevent silent breaking updates.

**SECURITY DEFINER for RLS Helper Functions**  
`my_participant()`, `is_admin_or_coadmin()`, and `is_admin()` are declared `SECURITY DEFINER`. Without this, calling them inside an RLS policy causes infinite recursion (the policy calls the function, the function queries the table protected by the policy). SECURITY DEFINER makes them run as the function owner (postgres), bypassing the recursive RLS check.

**Invite Code: 8-char Alphanumeric, URL-Safe**  
Character set: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — deliberately excludes `O`, `0`, `1`, `I` to avoid visual confusion. Generated by a Postgres function `generate_invite_code()` with up to 10 collision retries. Exposed as `VOLATILE SECURITY DEFINER`.

**Co-Admin Role (v3.0)**  
`CO_ADMIN` is a trusted deputy role between `ADMIN` and `PARTICIPANT`. Co-Admins can assign Juz, manage invites, remove members, and broadcast messages. They cannot change group settings, promote/demote other Co-Admins, or delete the group. Only the ADMIN can do those.

**Web Join URL Uses invite_code, Not group UUID**  
Early versions used the group's UUID in the web join URL. This was changed to use the 8-character `invite_code` (`/join/:invite_code`). The URL is shorter, user-friendly, and doesn't expose internal database IDs.

**Edge Function Timeouts**  
Twilio API calls in both Edge Functions use a 10-second `AbortController` timeout. This prevents the function from hanging for the full 150-second wall clock limit. If Twilio fails, a fallback notification row is queued for retry by the scheduler.

**Concurrent Batch Notification Processing**  
The scheduler sends notifications in batches of 10 concurrent requests (`Promise.allSettled`) instead of sequentially. This respects Twilio's rate limits while being much faster than sequential for large groups.

### 2.3 Security Decisions

**Role Escalation Prevention (RLS)**  
The participants `UPDATE` policy is split into two:
1. Admin update policy: `ADMIN` can update any participant row (including role changes)
2. Participant self-update policy: participants can update only their own non-role fields, with a `WITH CHECK` clause that enforces `role = (SELECT role FROM participants WHERE id = participants.id LIMIT 1)` — preventing role escalation via the self-update path.

**Audit Log is Server-Side Only**  
The `audit_log` table has no INSERT policy for client users. Writes are exclusively via Edge Functions using the service role key. This prevents log tampering.

**Notifications Are Server-Side Only**  
The `notifications` table has no INSERT policy for clients. Only the notification-scheduler Edge Function (service role) can enqueue notifications.

---

## 3. Database Schema

### Source File
`c:\Users\zamir\OneDrive\Desktop\Group-khatm\supabase\migrations\001_initial_schema.sql`

### Enums

```sql
create type occasion_type as enum (
  'GENERAL', 'MEMORIAL', 'RAMADAN', 'EID', 'CUSTOM'
);

create type group_language as enum (
  'AR', 'EN', 'UR', 'TR', 'FR', 'ID', 'MS'
);

create type assignment_mode as enum (
  'AUTO', 'ADMIN', 'PARTICIPANT', 'MIXED'
);

create type group_status as enum (
  'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'
);

-- v3.0: CO_ADMIN added between ADMIN and PARTICIPANT
create type participant_role as enum (
  'ADMIN', 'CO_ADMIN', 'PARTICIPANT'
);

create type participant_status as enum (
  'INVITED', 'JOINED', 'REMOVED', 'LEFT'
);

create type contact_type as enum (
  'WHATSAPP', 'SMS', 'EMAIL'
);

create type juz_status as enum (
  'AVAILABLE', 'RESERVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'
);

create type notification_channel as enum (
  'WHATSAPP', 'SMS', 'EMAIL', 'PUSH'
);

create type notification_status as enum (
  'QUEUED', 'SENDING', 'DELIVERED', 'FAILED'
);

create type notification_type as enum (
  'N_01_INVITE_NOT_JOINED_3D',
  'N_02_INVITE_NOT_JOINED_5D_ADMIN',
  'N_03_JUZ_NOT_STARTED_3D',
  'N_04_JUZ_NOT_STARTED_5D_ADMIN',
  'N_05_IN_PROGRESS_NO_UPDATE_4D',
  'N_06_IN_PROGRESS_NO_UPDATE_7D',
  'N_07_DEADLINE_7D',
  'N_08_DEADLINE_3D',
  'N_09_DEADLINE_24H',
  'N_10_DEADLINE_PASSED',
  'N_11_JUZ_COMPLETED',
  'N_12_ALL_JUZ_COMPLETED'
);

create type invite_status as enum (
  'PENDING', 'JOINED', 'EXPIRED'
);

create type progress_source as enum (
  'IN_APP', 'WEB_FORM', 'AUTO_TRACKING', 'ADMIN_OVERRIDE'
);

create type audit_action_type as enum (
  'GROUP_CREATED',
  'MEMBER_JOINED',
  'ROLE_ASSIGNED',
  'ROLE_REVOKED',
  'JUZ_ASSIGNED',
  'JUZ_REASSIGNED',
  'PROGRESS_UPDATED',
  'MEMBER_REMOVED',
  'BROADCAST_SENT',
  'GROUP_SETTINGS_CHANGED',
  'GROUP_ARCHIVED'
);
```

### Table: khatm_groups

```sql
create table khatm_groups (
  id                    uuid primary key default uuid_generate_v4(),
  title                 varchar(80) not null,
  intention             text,
  occasion_type         occasion_type not null default 'GENERAL',
  target_date           date not null,
  timezone              varchar(64) not null default 'UTC',
  language              group_language not null default 'EN',
  assignment_mode       assignment_mode not null default 'ADMIN',
  allow_multi_per_juz   boolean not null default false,
  allow_juz_switch      boolean not null default true,
  require_admin_approval boolean not null default false,
  invite_code           varchar(8) not null unique,
  status                group_status not null default 'ACTIVE',
  admin_user_id         uuid not null references auth.users(id) on delete restrict,
  created_at            timestamptz not null default now(),
  completed_at          timestamptz
);

create index idx_khatm_groups_admin on khatm_groups(admin_user_id);
create index idx_khatm_groups_status on khatm_groups(status);
create index idx_khatm_groups_invite_code on khatm_groups(invite_code);
```

### Table: participants

```sql
create table participants (
  id                    uuid primary key default uuid_generate_v4(),
  group_id              uuid not null references khatm_groups(id) on delete cascade,
  user_id               uuid references auth.users(id) on delete set null,
  name                  varchar(100) not null,
  contact_type          contact_type not null default 'WHATSAPP',
  contact_value         varchar(255) not null,
  contact_token         varchar(32) not null unique,
  role                  participant_role not null default 'PARTICIPANT',
  status                participant_status not null default 'INVITED',
  privacy_share_progress boolean not null default true,
  joined_at             timestamptz,
  last_active_at        timestamptz,

  -- Prevent duplicate contacts per group
  unique(group_id, contact_value)
);

create index idx_participants_group on participants(group_id);
create index idx_participants_user on participants(user_id);
create index idx_participants_token on participants(contact_token);
create index idx_participants_role on participants(group_id, role);
```

### Table: juz_assignments

```sql
-- Spec Section 7.3: ONE ROW PER PERSON PER JUZ
create table juz_assignments (
  id                uuid primary key default uuid_generate_v4(),
  group_id          uuid not null references khatm_groups(id) on delete cascade,
  participant_id    uuid not null references participants(id) on delete cascade,
  juz_number        smallint not null check (juz_number between 1 and 30),
  status            juz_status not null default 'ASSIGNED',
  progress_percent  smallint not null default 0 check (progress_percent between 0 and 100),
  last_note         varchar(100),
  assigned_at       timestamptz not null default now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  last_updated_at   timestamptz not null default now(),
  assigned_by       uuid references participants(id) on delete set null,

  -- One assignment per person per Juz per group
  unique(group_id, participant_id, juz_number)
);

create index idx_juz_group on juz_assignments(group_id);
create index idx_juz_participant on juz_assignments(participant_id);
create index idx_juz_number on juz_assignments(group_id, juz_number);
create index idx_juz_status on juz_assignments(status);
create index idx_juz_last_updated on juz_assignments(last_updated_at);
```

### Table: progress_updates (Immutable Ledger)

```sql
create table progress_updates (
  id                uuid primary key default uuid_generate_v4(),
  assignment_id     uuid not null references juz_assignments(id) on delete cascade,
  participant_id    uuid not null references participants(id) on delete cascade,
  progress_percent  smallint not null check (progress_percent between 0 and 100),
  previous_percent  smallint not null default 0,
  note              varchar(100),
  source            progress_source not null default 'IN_APP',
  created_at        timestamptz not null default now()
);

create index idx_progress_assignment on progress_updates(assignment_id);
create index idx_progress_participant on progress_updates(participant_id);
create index idx_progress_created on progress_updates(created_at desc);
```

### Table: notifications

```sql
create table notifications (
  id                        uuid primary key default uuid_generate_v4(),
  group_id                  uuid not null references khatm_groups(id) on delete cascade,
  recipient_participant_id  uuid not null references participants(id) on delete cascade,
  notification_type         notification_type not null,
  channel                   notification_channel not null,
  status                    notification_status not null default 'QUEUED',
  scheduled_at              timestamptz not null,
  sent_at                   timestamptz,
  message_body              text not null,
  retry_count               smallint not null default 0,

  -- [FIX-A1] CRITICAL: Was missing — enqueueNotification uses upsert onConflict
  -- that references these columns. Without this constraint, the upsert throws a
  -- runtime error and ALL notifications silently fail.
  unique (recipient_participant_id, notification_type, channel)
);

create index idx_notif_status_scheduled on notifications(status, scheduled_at)
  where status in ('QUEUED', 'FAILED');
create index idx_notif_group on notifications(group_id);
create index idx_notif_recipient on notifications(recipient_participant_id);
```

### Table: invites

```sql
create table invites (
  id              uuid primary key default uuid_generate_v4(),
  group_id        uuid not null references khatm_groups(id) on delete cascade,
  invited_by      uuid not null references participants(id) on delete cascade,
  channel         contact_type not null,
  contact_value   varchar(255) not null,
  status          invite_status not null default 'PENDING',
  invite_sent_at  timestamptz not null default now(),
  expires_at      timestamptz not null,
  participant_id  uuid references participants(id) on delete set null,

  -- Prevent duplicate invites per contact per group
  unique(group_id, contact_value)
);

create index idx_invites_group on invites(group_id);
create index idx_invites_status on invites(status);
create index idx_invites_expires on invites(expires_at) where status = 'PENDING';
```

### Table: audit_log (Immutable)

```sql
create table audit_log (
  id                    uuid primary key default uuid_generate_v4(),
  group_id              uuid not null references khatm_groups(id) on delete cascade,
  actor_participant_id  uuid references participants(id) on delete set null,
  action_type           audit_action_type not null,
  target_entity_type    varchar(50),
  target_entity_id      uuid,
  old_value             jsonb,
  new_value             jsonb,
  created_at            timestamptz not null default now()
);

create index idx_audit_group on audit_log(group_id, created_at desc);
create index idx_audit_actor on audit_log(actor_participant_id);
```

### Database Triggers & Functions

**Trigger 1: update_juz_last_updated()**
```sql
create or replace function update_juz_last_updated()
returns trigger as $$
begin
  new.last_updated_at = now();
  -- Auto-set started_at on first progress > 0
  if new.progress_percent > 0 and old.progress_percent = 0 then
    new.started_at = now();
    new.status = 'IN_PROGRESS';
  end if;
  -- Auto-set completed_at and status on 100%
  if new.progress_percent = 100 and old.progress_percent < 100 then
    new.completed_at = now();
    new.status = 'COMPLETED';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger juz_assignment_updated
  before update on juz_assignments
  for each row execute function update_juz_last_updated();
```

**Trigger 2: check_group_completion()**
```sql
create or replace function check_group_completion()
returns trigger as $$
declare
  total_juz int;
  completed_juz int;
begin
  -- Count distinct Juz numbers that have at least one COMPLETED assignment
  select count(distinct juz_number)
  into completed_juz
  from juz_assignments
  where group_id = new.group_id
    and status = 'COMPLETED';

  if completed_juz >= 30 then
    update khatm_groups
    set status = 'COMPLETED', completed_at = now()
    where id = new.group_id
      and status = 'ACTIVE';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger check_completion_after_juz
  after update on juz_assignments
  for each row
  when (new.status = 'COMPLETED' and old.status != 'COMPLETED')
  execute function check_group_completion();
```

**Function: generate_invite_code()**
```sql
create or replace function generate_invite_code()
returns varchar(8)
language plpgsql
volatile
security definer
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- No O,0,1,I to avoid confusion
  code varchar(8) := '';
  attempt int := 0;
  i int;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;

    -- Retry if code already exists (collision — extremely rare but handled)
    exit when not exists (select 1 from khatm_groups where invite_code = code);

    attempt := attempt + 1;
    if attempt > 10 then
      raise exception 'Could not generate unique invite code after 10 attempts';
    end if;
  end loop;

  return code;
end;
$$;
```

### Row Level Security (RLS) Policies

**Source File:** `c:\Users\zamir\OneDrive\Desktop\Group-khatm\supabase\migrations\002_rls_policies.sql`

**Helper Functions (SECURITY DEFINER):**
```sql
create or replace function my_participant(p_group_id uuid)
returns participants as $$
  select * from participants
  where group_id = p_group_id
    and user_id = auth.uid()
    and status = 'JOINED'
  limit 1;
$$ language sql security definer stable;

create or replace function is_admin_or_coadmin(p_group_id uuid)
returns boolean as $$
  select exists (
    select 1 from participants
    where group_id = p_group_id
      and user_id = auth.uid()
      and role in ('ADMIN', 'CO_ADMIN')
      and status = 'JOINED'
  );
$$ language sql security definer stable;

create or replace function is_admin(p_group_id uuid)
returns boolean as $$
  select exists (
    select 1 from participants
    where group_id = p_group_id
      and user_id = auth.uid()
      and role = 'ADMIN'
      and status = 'JOINED'
  );
$$ language sql security definer stable;
```

**Full Policies:**

```sql
-- khatm_groups: members can view, authenticated users can create, admin can update
create policy "Members can view their groups"
  on khatm_groups for select
  using (
    exists (
      select 1 from participants
      where group_id = khatm_groups.id
        and user_id = auth.uid()
        and status = 'JOINED'
    )
  );

create policy "Authenticated users can create groups"
  on khatm_groups for insert
  with check (auth.uid() = admin_user_id);

create policy "Admin can update group settings"
  on khatm_groups for update
  using (is_admin(id))
  with check (is_admin(id));

-- participants: split into two policies to prevent role escalation
create policy "Members can view participants in their group"
  on participants for select
  using (
    exists (
      select 1 from participants p2
      where p2.group_id = participants.group_id
        and p2.user_id = auth.uid()
        and p2.status = 'JOINED'
    )
  );

create policy "Admin and Co-Admin can add participants"
  on participants for insert
  with check (is_admin_or_coadmin(group_id) or auth.uid() is not null);

-- [P2-FIX-11] SECURITY FIX: Split into two policies to prevent role escalation
create policy "Admin can update any participant"
  on participants for update
  using (is_admin(group_id))
  with check (is_admin(group_id));

create policy "Participants can update own non-role fields"
  on participants for update
  using (
    user_id = auth.uid()
    and not is_admin(group_id)
  )
  with check (
    user_id = auth.uid()
    -- Prevent role escalation: new role must equal current role
    and role = (select role from participants where id = participants.id limit 1)
  );

create policy "Admin and Co-Admin can remove participants"
  on participants for delete
  using (is_admin_or_coadmin(group_id));

-- juz_assignments
create policy "Members can view Juz assignments"
  on juz_assignments for select
  using (
    exists (
      select 1 from participants
      where group_id = juz_assignments.group_id
        and user_id = auth.uid()
        and status = 'JOINED'
    )
  );

create policy "Admin and Co-Admin can assign Juz"
  on juz_assignments for insert
  with check (is_admin_or_coadmin(group_id));

create policy "Admin, Co-Admin, or assignee can update Juz"
  on juz_assignments for update
  using (
    is_admin_or_coadmin(group_id)
    or exists (
      select 1 from participants
      where id = juz_assignments.participant_id
        and user_id = auth.uid()
    )
  );

-- progress_updates
create policy "Members can view progress updates"
  on progress_updates for select
  using (
    exists (
      select 1 from participants p
      join juz_assignments ja on ja.id = progress_updates.assignment_id
      where p.group_id = ja.group_id
        and p.user_id = auth.uid()
        and p.status = 'JOINED'
    )
  );

create policy "Participants can log their own progress"
  on progress_updates for insert
  with check (
    exists (
      select 1 from participants
      where id = progress_updates.participant_id
        and user_id = auth.uid()
    )
    or exists (
      select 1 from juz_assignments ja
      join participants p on p.group_id = ja.group_id
      where ja.id = progress_updates.assignment_id
        and p.user_id = auth.uid()
        and p.role in ('ADMIN', 'CO_ADMIN')
    )
  );

-- notifications: recipient only (read), no client insert
create policy "Participants can view their own notifications"
  on notifications for select
  using (
    exists (
      select 1 from participants
      where id = notifications.recipient_participant_id
        and user_id = auth.uid()
    )
  );

-- invites: Admin and Co-Admin only
create policy "Admin and Co-Admin can manage invites"
  on invites for all
  using (is_admin_or_coadmin(group_id))
  with check (is_admin_or_coadmin(group_id));

-- audit_log: Admin and Co-Admin read, service role insert only
create policy "Admin and Co-Admin can view audit log"
  on audit_log for select
  using (is_admin_or_coadmin(group_id));
-- No client insert policy — server-side writes only
```

### Seed Data (Dev)

**Source File:** `c:\Users\zamir\OneDrive\Desktop\Group-khatm\supabase\migrations\003_seed_data.sql`

**Test Users:**
- Fatima Al-Rashidi (`+201234567890`, `fatima@example.com`)
- Yusuf (`+201234567891`, `yusuf@example.com`)
- Hajja Khadija (`+201234567892`, no email — web-only)
- Omar (`+201234567893`, no email)

**Password:** All use bcrypt hash of `TestPassword123!` (`$2a$10$PgjZkulBRbJiMGhJKLMGr.hHy0WUXf7OL5OGgCXVfSI.9vQHe0Yky`)

**Test Groups:**
1. `Mama's Arba'een Khatm` — MEMORIAL, ADMIN mode, invite code `F3A9X2AB`, 70% complete
   - Admin: Fatima, Co-Admin: Omar, Members: Yusuf, Hajja Khadija
   - 21 Juz done, 4 in-progress, 3 stalled (triggers N-03/N-04)
2. `Ramadan Family Khatm 2025` — RAMADAN, AUTO mode, invite code `RAM2025X`
   - Admin: Yusuf, Co-Admin: Fatima
3. `Masjid Al-Noor Community Khatm` — GENERAL, PARTICIPANT mode, invite code `ALNOOR01`
   - Admin: Yusuf, Member: Fatima

### Shared TypeScript Types

**Source File:** `c:\Users\zamir\OneDrive\Desktop\Group-khatm\packages\shared\src\types.ts`

```typescript
export interface KhatmGroup {
  id: string;
  title: string;
  intention: string | null;
  occasion_type: OccasionType;
  target_date: string;          // ISO date string YYYY-MM-DD
  timezone: string;             // IANA timezone e.g. 'Africa/Cairo'
  language: GroupLanguage;
  assignment_mode: AssignmentMode;
  allow_multi_per_juz: boolean;
  allow_juz_switch: boolean;
  require_admin_approval: boolean;
  invite_code: string;          // 8-char alphanumeric
  status: GroupStatus;
  admin_user_id: string;
  created_at: string;
  completed_at: string | null;
}

export interface Participant {
  id: string;
  group_id: string;
  user_id: string | null;       // NULL for web/non-app participants
  name: string;
  contact_type: ContactType;
  contact_value: string;        // E.164 phone or email
  contact_token: string;        // 32-char token for web URL auth
  role: ParticipantRole;
  status: ParticipantStatus;
  privacy_share_progress: boolean;
  joined_at: string | null;
  last_active_at: string | null;
}

export interface JuzAssignment {
  id: string;
  group_id: string;
  participant_id: string;
  juz_number: number;           // 1–30
  status: JuzStatus;
  progress_percent: number;     // 0–100
  last_note: string | null;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_updated_at: string;
  assigned_by: string | null;   // participant_id of assigner
}

export interface ProgressUpdate {
  id: string;
  assignment_id: string;
  participant_id: string;
  progress_percent: number;
  previous_percent: number;
  note: string | null;
  source: ProgressSource;
  created_at: string;
}

export interface Notification {
  id: string;
  group_id: string;
  recipient_participant_id: string;
  notification_type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  scheduled_at: string;
  sent_at: string | null;
  message_body: string;
  retry_count: number;
}

export interface Invite {
  id: string;
  group_id: string;
  invited_by: string;           // participant_id
  channel: ContactType;
  contact_value: string;
  status: InviteStatus;
  invite_sent_at: string;
  expires_at: string;           // 30 days from send
  participant_id: string | null;// Set when joined
}

export interface AuditLog {
  id: string;
  group_id: string;
  actor_participant_id: string;
  action_type: AuditActionType;
  target_entity_type: string;
  target_entity_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

/** Used in Multi-Khatm Hub switcher strip */
export interface KhatmSwitcherCard {
  group_id: string;
  title: string;
  role: ParticipantRole;
  progress_percent: number;    // Aggregated: completed_juz / 30 * 100
  days_remaining: number;
  member_count: number;
  has_unread: boolean;         // New activity since last viewed
}

/** Juz tile data for the 30-tile grid */
export interface JuzTileData {
  juz_number: number;
  assignments: Array<{
    participant_id: string;
    participant_name: string;
    progress_percent: number;
    status: JuzStatus;
  }>;
  is_multi: boolean;           // 2+ assignees
  display_status: 'done' | 'in_progress' | 'mine' | 'multi' | 'open';
}

export interface CreateGroupInput {
  title: string;
  intention?: string;
  occasion_type: OccasionType;
  target_date: string;
  timezone: string;
  language: GroupLanguage;
  assignment_mode: AssignmentMode;
  allow_multi_per_juz: boolean;
  allow_juz_switch: boolean;
  require_admin_approval: boolean;
}

export interface WebJoinInput {
  invite_code: string;
  name: string;
  contact_value: string;       // Phone (E.164) or email
  contact_type: ContactType;
}
```

### Shared Constants

**Source File:** `c:\Users\zamir\OneDrive\Desktop\Group-khatm\packages\shared\src\constants.ts`

```typescript
// Juz names (leading Surah per Juz)
export const JUZ_NAMES: Record<number, string> = {
  1: 'Al-Baqarah', 2: 'Al-Baqarah', 3: 'Al-Baqarah',
  4: "Al-'Imran", 5: "Al-Nisa'", 6: "Al-Nisa'",
  7: "Al-Ma'idah", 8: "Al-An'am", 9: "Al-A'raf",
  10: 'Al-Anfal', 11: 'Yunus', 12: 'Hud',
  13: 'Ibrahim', 14: 'Al-Hijr', 15: "Al-Isra'",
  16: 'Al-Kahf', 17: 'Al-Anbiya', 18: 'Al-Muminun',
  19: 'Al-Furqan', 20: 'Al-Naml', 21: "Al-'Ankabut",
  22: 'Al-Ahzab', 23: 'Ya-Sin', 24: 'Al-Zumar',
  25: 'Fussilat', 26: 'Al-Ahqaf', 27: 'Al-Dhariyat',
  28: 'Al-Mujadila', 29: 'Al-Mulk', 30: "An-Naba'",
};

// Quran page ranges per Juz (Madinah Mushaf, 604 pages)
export const JUZ_PAGE_RANGES: Record<number, { start: number; end: number }> = {
  1:  { start: 1,   end: 21  }, 2:  { start: 22,  end: 41  },
  3:  { start: 42,  end: 61  }, 4:  { start: 62,  end: 81  },
  5:  { start: 82,  end: 101 }, 6:  { start: 102, end: 121 },
  7:  { start: 122, end: 141 }, 8:  { start: 142, end: 161 },
  9:  { start: 162, end: 181 }, 10: { start: 182, end: 201 },
  11: { start: 202, end: 221 }, 12: { start: 222, end: 241 },
  13: { start: 242, end: 261 }, 14: { start: 262, end: 281 },
  15: { start: 282, end: 301 }, 16: { start: 302, end: 321 },
  17: { start: 322, end: 341 }, 18: { start: 342, end: 361 },
  19: { start: 362, end: 381 }, 20: { start: 382, end: 401 },
  21: { start: 402, end: 421 }, 22: { start: 422, end: 441 },
  23: { start: 442, end: 461 }, 24: { start: 462, end: 481 },
  25: { start: 482, end: 501 }, 26: { start: 502, end: 521 },
  27: { start: 522, end: 541 }, 28: { start: 542, end: 561 },
  29: { start: 562, end: 581 }, 30: { start: 582, end: 604 },
};

// Design tokens
export const COLORS = {
  forestDeep:  '#0e2318',
  forest:      '#163a27',
  forestMid:   '#1f5238',
  forestLight: '#2d7a52',
  forestBright:'#3d9e6e',
  mint:        '#8fdfb8',
  gold:        '#c8921a',
  goldLight:   '#e8b84b',
  goldPale:    '#f5d88a',
  cream:       '#faf8f2',
  sand:        '#f0ead8',
  red:         '#b83228',
  amber:       '#c47a0a',
  blue:        '#1a5fa8',
  purple:      '#6a1b9a',
} as const;

// Invite configuration
export const INVITE_CODE_LENGTH = 8;
export const INVITE_EXPIRY_DAYS = 30;
export const CONTACT_TOKEN_LENGTH = 32;

// Permission matrix (v3.0 with CO_ADMIN)
export const CAN_ASSIGN_JUZ = ['ADMIN', 'CO_ADMIN'] as const;
export const CAN_REASSIGN_JUZ = ['ADMIN', 'CO_ADMIN'] as const;
export const CAN_BROADCAST = ['ADMIN', 'CO_ADMIN'] as const;
export const CAN_MANAGE_INVITES = ['ADMIN', 'CO_ADMIN'] as const;
export const CAN_REMOVE_MEMBER = ['ADMIN', 'CO_ADMIN'] as const;
export const CAN_CHANGE_SETTINGS = ['ADMIN'] as const;
export const CAN_ASSIGN_COADMIN = ['ADMIN'] as const;
export const CAN_REVOKE_COADMIN = ['ADMIN'] as const;
export const CAN_DELETE_GROUP = ['ADMIN'] as const;

// Stall detection thresholds
export const STALL_THRESHOLDS = {
  invite_not_joined_days: 3,
  invite_not_joined_admin_days: 5,
  juz_not_started_days: 3,
  juz_not_started_admin_days: 5,
  in_progress_no_update_days: 4,
  in_progress_no_update_admin_days: 7,
};

// Multi-Khatm limits (v3.0)
export const MAX_ACTIVE_KHATMS_SOFT_LIMIT = 20;
```

---

## 4. UI/UX Screens Designed

### 4.1 Mobile Screens (React Native / Expo)

**Source Directory:** `c:\Users\zamir\OneDrive\Desktop\Group-khatm\apps\mobile\src\screens\`

#### CreateKhatmScreen — 4-Step Stepper
**File:** `apps/mobile/src/screens/CreateKhatmScreen.tsx` (331 lines)

**Step 1: Basic Info**
- Title field (80 char max, required)
- Niyyah/Intention field (300 char max, optional)
- Occasion type chip selector: GENERAL, MEMORIAL, RAMADAN, EID, CUSTOM

**Step 2: Deadline + Language**
- Target date input (YYYY-MM-DD format) [TODO: DatePickerModal]
- Language chip selector: AR, EN, UR, TR, FR, ID, MS
- Timezone display (auto-detected, not editable) [TODO: picker]

**Step 3: Assignment Rules**
- Assignment Mode selector: ADMIN (you assign), AUTO (system distributes), PARTICIPANT (members pick), MIXED
- allow_multi_per_juz toggle: "Enable shared reading"

**Step 4: Review & Submit**
- Full summary of all entered data
- Create button

**Submit Logic:**
1. Calls `supabase.rpc('generate_invite_code')` to get unique 8-char code
2. Inserts into `khatm_groups`
3. Inserts creator as ADMIN participant
4. Calls `setActiveKhatm(khatm)` from Zustand store
5. Invalidates `useMyKhatms` query
6. Navigates to Home screen
7. [TODO: WhatsApp share sheet]

#### ManageKhatmsScreen — All Khatms List
**File:** `apps/mobile/src/screens/ManageKhatmsScreen.tsx` (227 lines)

**Layout:**
1. Header: "All My Khatms" + count badge
2. One card per Khatm, sorted by role (ADMIN first)
3. Per card: title, role badge, progress bar, days remaining, member count
4. Role-gated action row:
   - View (all roles)
   - Roles (ADMIN only)
   - Broadcast (CO_ADMIN only)
   - Archive (ADMIN only)
   - Leave (non-ADMIN only)
5. Bottom CTAs: + Create, 🔗 Join

#### HomeScreen — Admin Dashboard
**File:** `apps/mobile/src/screens/HomeScreen.tsx` (118 lines)

**Components mounted:**
- Hero header: Khatm title, role pill, progress percentage
- Stats row: Done / Reading / Pending / Members [TODO: M8]
- JuzGrid component (30 tiles, live via `useJuzGridRealtime`)
- ParticipantList component (role-gated management)
- Deadline section [TODO]
- Invite section [TODO]
- Activity log [TODO]

**[P3-FIX-6]** Added `useJuzGridRealtime(groupId)` call — was missing, M6 acceptance was broken.

#### LoginScreen
**File:** `apps/mobile/src/screens/LoginScreen.tsx` (auth screen, stub content)

#### OtpScreen
**File:** `apps/mobile/src/screens/OtpScreen.tsx` (OTP verification, stub content)

#### ParticipantScreen
**File:** `apps/mobile/src/screens/ParticipantScreen.tsx` (stub implementation)

#### ProfileScreen
**File:** `apps/mobile/src/screens/ProfileScreen.tsx` (stub implementation)

### 4.2 Mobile Components

**Source Directory:** `c:\Users\zamir\OneDrive\Desktop\Group-khatm\apps\mobile\src\components\`

#### KhatmHubBar — Persistent Multi-Khatm Strip
**File:** `apps/mobile/src/components/KhatmHubBar.tsx` (194 lines)

**Purpose:** Persistent navigation strip at the top of all screens. Users can see all their Khatms at a glance and switch between them.

**Layout:**
- Top row: "🕌 MY KHATMS" label + action buttons (＋ Create, 🔗 Join, ⚙️ Manage)
- Horizontal scroll strip of Khatm cards:
  - Per card: role badge, title, progress bar, days/members metadata
  - Active card: green glow border + background highlight
  - Unread indicator: red dot when `has_unread = true`
  - Add card at end: "＋ New Khatm" button

**Interaction:**
- Tap card → `setActiveKhatm(khatm)` → `navigate('Home')`
- Updates global context for entire app simultaneously

#### JuzGrid — 30-Tile Grid
**File:** `apps/mobile/src/components/JuzGrid.tsx`

- Renders a 30-tile grid for Juz 1–30
- Color-coded by `display_status`:
  - `done` → green
  - `mine` → blue
  - `in_progress` → yellow
  - `multi` → purple
  - `open` → gray
- Tap tile: admin → assign Juz, participant → view details

#### ProgressUpdateSheet — Progress Bottom Sheet
**File:** `apps/mobile/src/components/ProgressUpdateSheet.tsx`

- Bottom sheet modal
- Shows participant name and current progress
- Slider to set new progress value (0–100%)
- Save button triggers `useUpdateProgress` mutation

#### JuzDetailSheet — Juz Detail Modal
**File:** `apps/mobile/src/components/JuzDetailSheet.tsx`

- Shows all assignments for a given Juz number
- Participant names, progress percentages, edit capability

#### ParticipantList — Members List
**File:** `apps/mobile/src/components/ParticipantList.tsx`

- Lists all JOINED participants for a group
- Role badges next to names
- Contact info display
- Admin can promote to Co-Admin

#### RoleManagerSheet — Role Management Modal
**File:** `apps/mobile/src/components/RoleManagerSheet.tsx`

- Admin-only modal for managing participant roles
- Assign/revoke CO_ADMIN role
- Triggers `useAssignRole` mutation

### 4.3 Web Screens (Next.js)

**Source Directory:** `c:\Users\zamir\OneDrive\Desktop\Group-khatm\apps\web\`

#### Web Join Page — `/join/[invite_code]`
**Files:**
- `apps/web/app/join/[token]/page.tsx` — Dynamic Next.js route
- `apps/web/app/join/[token]/JoinForm.tsx` (195 lines) — Form component

**Form States:** `idle`, `submitting`, `success`, `error`

**Form Fields:**
- Name (required)
- Contact value (required, E.164 phone or email)
- Contact type radio: WHATSAPP / SMS / EMAIL
- Email (optional)

**Validation:** Zod `WebJoinSchema`

**Success Screen:**
- Shows assigned Juz number (if AUTO mode) with Islamic greeting
- "You'll receive a WhatsApp confirmation"
- Arabic dua: `بَارَكَ اللَّهُ فِيكَ 🤲`

**[P2-FIX-14]** Clears `errorMsg` when re-submitting (was persisting previous error).

#### Web API Endpoint — POST `/api/join`
**File:** `apps/web/app/api/join/route.ts` (59 lines)

- Validates payload with Zod `WebJoinSchema`
- Forwards to Supabase Edge Function `invite-handler` with service role key
- Returns Edge Function response to client

### 4.4 Prototype Screens (Project Code)

**Source Directory:** `c:\Users\zamir\OneDrive\Desktop\Project Code\group-khatm\`

These are mock/prototype screens not connected to Supabase:

- `app/(tabs)/my-khatm.tsx` — Personal Khatm progress
- `app/(tabs)/group.tsx` — Group members and overview
- `app/(tabs)/(home)/index.tsx` — Home dashboard
- `app/(tabs)/(home)/dashboard.tsx` — Dashboard variant
- `app/(tabs)/profile.tsx` — Profile screen

**Components:**
- `components/sheets/CreateKhatmSheet.tsx` — Bottom sheet creation form
- `components/sheets/JoinKhatmSheet.tsx` — Join form bottom sheet
- `components/sheets/JuzDetailSheet.tsx` — Juz detail view
- `components/sheets/ParticipantDetailSheet.tsx` — Participant detail view
- `components/home/HomeHeader.tsx` — Home header
- `components/home/SettingsPanel.tsx` — Settings panel
- `components/home/SettingsDropdown.tsx` — Settings dropdown menu
- `components/home/ParticipantList.tsx` — Participant list

**Mock Data Structure** (`constants/mockData.ts`):
```typescript
export const INITIAL_GROUP: Group = {
  id: 'group-1',
  name: 'Al-Noor Family Khatm',
  adminName: 'Rabia',
  memberCount: 9,
  targetDate: '2026-03-27',
  createdAt: '2026-02-15',
  assignmentMode: 'admin-assigns', // 'member-picks' | 'auto-assign' | 'hybrid'
  allowMultiplePerJuz: false,
  completedJuz: 21,
  totalJuz: 30,
}
```

---

## 5. Known Issues / What Was Left Incomplete

### 5.1 Critical Bugs Fixed (Audit Trail)

These are bugs that were found and fixed during the development of the production monorepo. They represent real issues that would have broken the feature:

**[FIX-A1] CRITICAL: Notification unique constraint missing**
- **Impact:** ALL notifications silently failed to enqueue
- **Root cause:** `enqueueNotification()` used `upsert` with `onConflict: 'recipient_participant_id,notification_type,channel'` but the constraint did not exist in the schema
- **Fix:** Added `UNIQUE (recipient_participant_id, notification_type, channel)` to `notifications` table in migration 001

**[FIX-A2] SECURITY: Role escalation vulnerability**
- **Impact:** Any participant could update their own role to ADMIN/CO_ADMIN
- **Root cause:** Single broad UPDATE policy on `participants` didn't prevent self-role-escalation
- **Fix:** Split into two policies: Admin policy (any field) and Participant policy (non-role fields only, with role equality check in WITH CHECK)

**[P1-FIX-1] completedJuz always 0 in Multi-Khatm Hub**
- **Root cause:** `useMyKhatms()` hook did not include `juz_number` in the Supabase select, so the Set of completed Juz numbers was always empty
- **Fix:** Added `juz_number` to the select clause

**[P2-FIX-5+6] Auto-assign bug: wrong status filter**
- **Root cause:** `autoAssignJuz()` looked for rows with `status = 'AVAILABLE'` — but available Juz have NO row (absence = open). Also COMPLETED Juz were treated as available for multi-assignment incorrectly.
- **Fix:** Count rows with status in `['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'RESERVED']`; absence of row = open

**[P2-FIX-8] Twilio hang blocking invite-handler**
- **Root cause:** No timeout on Twilio API call; slow Twilio responses blocked the entire Edge Function
- **Fix:** 10-second `AbortController` timeout + fallback notification queue on failure

**[P3-FIX-1] Invite URL exposed group UUID**
- **Root cause:** Web join URL used `group.id` (UUID) instead of `invite_code` (8-char)
- **Fix:** Changed notification URL builder and Edge Function to use `invite_code`

**[P3-FIX-2+3+4] Three notification functions were console.log stubs**
- `checkJuzStalls()` — was `console.log('TODO')`
- `checkDeadlines()` — was `console.log('TODO')`
- `enqueueNotification()` — was `console.log('TODO')`
- **Fix:** Fully implemented all three

**[P3-FIX-5] Contact type hardcoded to WHATSAPP in web form**
- **Root cause:** Web join form always submitted `contact_type: 'WHATSAPP'` regardless of what user entered
- **Fix:** Added radio button group for WHATSAPP/SMS/EMAIL

**[P3-FIX-6] Missing realtime subscription in HomeScreen**
- **Root cause:** `useJuzGridRealtime(groupId)` was implemented but never called from HomeScreen
- **Fix:** Added the hook call in HomeScreen

**[P4-FIX-2] useJuzGridRealtime hook entirely missing from scaffold**
- **Root cause:** The realtime subscription hook was completely absent from the initial scaffold
- **Fix:** Implemented full hook with cleanup

**[P4-FIX-4] CORS headers missing on Edge Functions**
- **Root cause:** Options pre-flight requests from the Next.js web app failed with no CORS headers
- **Fix:** Added CORS headers to both `invite-handler` and `notification-scheduler`

### 5.2 Features Marked TODO (Incomplete)

These features are explicitly marked as `// TODO` in the codebase — they are not yet implemented:

- **`member_count` in KhatmSwitcherCard** — always returns `0`. TODO: fetch via separate count RPC
- **`has_unread` in KhatmSwitcherCard** — always returns `false`. TODO: compare audit_log vs MMKV `last_viewed_at`
- **Stats row in HomeScreen** — Done / Reading / Pending / Members counters are placeholder. TODO M8
- **Deadline section in HomeScreen** — Not implemented (TODO)
- **Invite section in HomeScreen** — Not implemented (TODO)
- **Activity log in HomeScreen** — Not implemented (TODO)
- **WhatsApp share sheet after group creation** — Not implemented (TODO)
- **DatePickerModal in CreateKhatmScreen** — date is typed as text, not a proper date picker
- **Timezone picker in CreateKhatmScreen** — timezone is auto-detected and display-only (TODO picker)
- **EMAIL notifications via SendGrid** — `// TODO M7: EMAIL via SendGrid` in notification-scheduler
- **PUSH notifications via Expo** — `// TODO M7: PUSH via Expo Push Notifications API` in notification-scheduler
- **N_00_JOIN_CONFIRM notification type** — invite-handler uses `N_12_ALL_JUZ_COMPLETED` as fallback type for join confirmation messages, with a `// TODO: add N_00_JOIN_CONFIRM` comment
- **N-02, N-04, N-06, N-10, N-11 notification checks** — Only N-01, N-03, N-05, N-07, N-08, N-09 are implemented in the scheduler. N-02/04/06 (admin escalations) and N-10 (deadline passed), N-11 (individual Juz completion) are not in the scheduler yet.
- **privacy_share_progress filtering** — RLS policy has `-- TODO: filter by privacy_share_progress if needed`
- **Broadcast feature** — UI shows button for CO_ADMIN but implementation not found
- **ParticipantScreen** — stub implementation
- **ProfileScreen** — stub implementation
- **stall-detector Edge Function** — directory exists at `supabase/functions/stall-detector/` but content not fully explored

### 5.3 Security Notes

- `contact_token` values in seed data use readable prefixes (`tok_fatima_g1_xxxxxxxx`) — these must be replaced with real random tokens for any real use
- `encrypted_password` values in seed data use a shared test password — never use in production
- The `notifications` table INSERT policy is absent (server-side only) — this is intentional

---

## 6. Lessons Learned Relevant to Khatm

These come from `c:\Users\zamir\OneDrive\Desktop\spec\.claude\specs\lessons.json`. They are from the `quran-recitation-tracker` spec but several apply directly to Khatm development:

### Design Lessons

**Every store/state field that represents a UI-visible flag must have an explicit setter action**
- Fields without setters are silent dead code
- Category: design | Severity: high
- _Directly relevant: `has_unread` in `KhatmSwitcherCard` is currently always `false` because there is no mechanism to set it. `member_count` is always `0` for the same reason._

**Always read the actual database schema before writing the design**
- Deriving type signatures from a placeholder schema causes full module rewrites
- Category: design | Severity: high
- _Directly relevant: The production monorepo's schema is the authoritative source. Any new Khatm features must derive types from the actual SQL, not assumptions._

**Store action specifications must explicitly state initialization semantics for fields set-once-on-first-call**
- 'Set on first X call' is not obvious — if unspecified, implementers will leave the field null
- Category: design | Severity: high
- _Directly relevant: `started_at` in `juz_assignments` is auto-set by the `update_juz_last_updated()` trigger on first `progress_percent > 0`. This is implicit. `assigned_at` is set on insert. These initialization semantics should be documented for any new fields._

**Barrel export files (index.ts) require 'export type' for interfaces when isolatedModules is enabled**
- Split into `export { EnumName }` and `export type { InterfaceName }` blocks
- Category: design | Severity: low
- _Directly relevant: `packages/shared/src/index.ts` must follow this pattern._

**Design matchers/scorers to expose raw confidence scores, not binary filters**
- Category: design | Severity: medium
- _Less directly relevant but applies to any future progress detection features._

**WCAG criteria for non-text elements must reference 1.4.11 (3:1), not 1.4.3 (4.5:1)**
- Category: design | Severity: low
- _Relevant to Juz Grid tile color contrast requirements._

### Implementation Lessons

**For React Native + TypeScript: use `globalThis` (not `global`), `Buffer.from(x).toString('base64')` (not `btoa`)**
- Category: implementation | Severity: high
- _Directly relevant: the `invite-handler` Edge Function uses `btoa()` for Twilio auth (Deno environment, where btoa is available). Mobile code must use `Buffer.from()`._

**Use try/finally for ALL resource cleanup (audio focus, file handles, timers)**
- Category: implementation | Severity: medium
- _Relevant: `sendWhatsApp()` and `sendConfirmation()` both use `try/finally` to `clearTimeout()` the abort controller. This pattern should continue._

**Tasks with 4+ output files risk hitting agent rate limits — write files directly**
- Category: implementation | Severity: medium

**For external API integrations, run a manual live-call verification script against the real endpoint before shipping**
- Mocks cannot detect API schema changes (AssemblyAI renamed fields without notice)
- Category: implementation | Severity: high
- _Directly relevant: Twilio API for WhatsApp. A live Twilio verification script should exist before go-live._

**Always add `.env` and `.env.*` to `.gitignore` before creating the file**
- The default React Native `.gitignore` does not include `.env`
- Category: implementation | Severity: high
- _Directly relevant: `.env.example` exists in the production monorepo. The actual `.env` must never be committed._

**In any script that reads `process.env`, dotenv must be imported and `config()` called before any other executable code**
- Category: implementation | Severity: medium

**Audio I/O thread buffers are reused by the OS — always copy synchronously before async dispatch**
- Category: implementation | Severity: high
- _Not directly relevant to Khatm but documents a platform pattern._

### Testing Lessons

**React Native fake-timer tests with async managers require a specific flush sequence**
- Category: testing | Severity: medium

**Never spread `jest.requireActual('react-native')` inside a `jest.mock()` factory in React Native 0.84+**
- Causes invariant violation from `TurboModuleRegistry.getEnforcing()`
- Category: testing | Severity: high

**NativeModules properties accessed via destructuring at module scope cannot be swapped in tests**
- Use a lazy getter function instead
- Category: testing | Severity: high

**`jest.mock()` factories are hoisted — `jest.fn()` created before `jest.mock()` will be `undefined` in factory**
- Category: testing | Severity: medium

**For Arabic normalization tests, manually apply the normalization pipeline to test strings first**
- Arabic words that look different may normalize to identical strings, inverting expected branches
- Category: testing | Severity: medium

**Run spec-acceptor before tagging — it finds design-to-implementation mismatches that unit tests miss**
- Category: testing | Severity: medium

---

## 7. External Dependencies Used

### Production Monorepo (`Group-khatm`)

**Mobile App (`apps/mobile/package.json`)**

| Package | Purpose |
|---------|---------|
| `expo` | React Native development framework |
| `@supabase/supabase-js` (pinned `@2.39.3`) | Supabase client — database, auth, realtime |
| `@tanstack/react-query` | Server state management, caching, mutations |
| `zustand` | Global client state (active Khatm context) |
| `react-native-mmkv` | Fast synchronous storage for Zustand persistence |

**Web App (`apps/web/package.json`)**

| Package | Purpose |
|---------|---------|
| `next` (v14) | Web framework with App Router |
| `@supabase/supabase-js` | Supabase client |
| `react-hook-form` | Web join form state management |
| `zod` | Schema validation (WebJoinSchema) |

**Shared Package (`packages/shared`)**

| Package | Purpose |
|---------|---------|
| `typescript` (^5.3.0) | Type checking |

**Root / Tooling**

| Package | Purpose |
|---------|---------|
| `turbo` (^1.13.0) | Monorepo build cache and task orchestration |
| `pnpm` (8.15.0) | Package manager |

**Edge Functions (Deno)**

| Import | Purpose |
|--------|---------|
| `https://esm.sh/@supabase/supabase-js@2.39.3` | Supabase admin client (service role) |
| `https://deno.land/std@0.168.0/http/server.ts` | Deno HTTP server |
| Twilio REST API (`api.twilio.com`) | WhatsApp and SMS sending |

**External Services**

| Service | Purpose | Config |
|---------|---------|--------|
| **Supabase** | Postgres DB, Auth, Realtime, Edge Functions, Storage | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Twilio** | WhatsApp messages + SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM` |
| **SendGrid** | Email notifications [NOT YET IMPLEMENTED] | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME` |
| **PostHog** | Analytics | `NEXT_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_KEY` |
| **Sentry** | Error monitoring | `NEXT_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN` |
| **EAS (Expo Application Services)** | Cloud builds for iOS/Android | Account: `zamirassad`, Project ID: `4d0a0f42-8804-4fba-90d9-d5300937dd0b` |

**Environment Variable Prefix Rules:**
- `NEXT_PUBLIC_*` → Exposed to browser (Next.js)
- `EXPO_PUBLIC_*` → Bundled into app binary (Expo)
- No prefix → Server/Edge only (never expose to client)

### Prototype (`Project Code/group-khatm`)

| Package | Purpose |
|---------|---------|
| `expo` | React Native framework |
| `expo-router` | File-based routing |
| No Supabase | All data is in-memory mock state via `useState` |

---

## Appendix A: File Manifest

### Production Monorepo (`c:\Users\zamir\OneDrive\Desktop\Group-khatm\`)

**Root**
- `package.json` — Monorepo definition (pnpm workspaces: apps/*, packages/*)
- `tsconfig.json` — Root TypeScript config
- `turbo.json` — Turbo build pipeline
- `.env.example` — Environment variable template (82 lines)

**packages/shared/src/**
- `types.ts` — All domain interfaces and type aliases (259 lines)
- `constants.ts` — JUZ_NAMES, JUZ_PAGE_RANGES, COLORS, notification rules, permission matrix, stall thresholds (198 lines)
- `index.ts` — Barrel export

**supabase/migrations/**
- `001_initial_schema.sql` — Tables, enums, indexes, triggers, functions (332 lines)
- `002_rls_policies.sql` — Row Level Security (233 lines)
- `003_seed_data.sql` — Dev seed: 3 groups, 4 users, Juz assignments (126 lines)

**supabase/functions/invite-handler/**
- `index.ts` — Web join endpoint: lookup group, create participant, auto-assign Juz, audit log, WhatsApp confirmation (268 lines)

**supabase/functions/notification-scheduler/**
- `index.ts` — All notification checks + queue processor: N-01, N-03, N-05, N-07, N-08, N-09, processQueue() (414 lines)

**supabase/functions/stall-detector/**
- (directory exists, content not fully explored)

**supabase/**
- `config.toml` — Supabase CLI configuration

**apps/mobile/src/hooks/**
- `useKhatm.ts` — TanStack Query hooks: useMyKhatms, useJuzGrid, useJuzGridRealtime, useParticipants, useUpdateProgress, useAssignJuz, useAssignRole (392 lines)
- `useKhatmStore.ts` — Zustand + MMKV store for active Khatm context (57 lines)

**apps/mobile/src/screens/**
- `CreateKhatmScreen.tsx` — 4-step group creation stepper (331 lines)
- `ManageKhatmsScreen.tsx` — All Khatms management view (227 lines)
- `HomeScreen.tsx` — Admin dashboard with Juz Grid (118 lines)
- `LoginScreen.tsx` — Authentication (stub)
- `OtpScreen.tsx` — OTP verification (stub)
- `ParticipantScreen.tsx` — Participant view (stub)
- `ProfileScreen.tsx` — Profile (stub)

**apps/mobile/src/components/**
- `KhatmHubBar.tsx` — Persistent multi-Khatm navigation strip (194 lines)
- `JuzGrid.tsx` — 30-tile grid display
- `JuzDetailSheet.tsx` — Juz detail bottom sheet modal
- `ProgressUpdateSheet.tsx` — Progress update bottom sheet
- `ParticipantList.tsx` — Group members list
- `RoleManagerSheet.tsx` — Role management modal (Admin only)

**apps/web/app/**
- `layout.tsx` — Root Next.js layout
- `api/join/route.ts` — POST /api/join endpoint (59 lines)
- `join/[token]/page.tsx` — Dynamic join page
- `join/[token]/JoinForm.tsx` — Join form component (195 lines)

**apps/web/lib/**
- `supabase.ts` — Supabase client initialization

### Prototype (`c:\Users\zamir\OneDrive\Desktop\Project Code\group-khatm\`)

- `CLAUDE.md` — Islamic super-app project identity and rules
- `package.json` — Expo dependencies (no Supabase)
- `App.tsx` — Entry point
- `constants/mockData.ts` — Mock Khatm group, participants, Juz states (80 lines)
- `hooks/useKhatmStore.ts` — useState-based store (no persistence)
- `app/(tabs)/my-khatm.tsx` — Personal progress screen
- `app/(tabs)/group.tsx` — Group overview screen
- `app/(tabs)/(home)/index.tsx` — Home/dashboard
- `app/(tabs)/(home)/dashboard.tsx` — Dashboard variant
- `components/sheets/CreateKhatmSheet.tsx` — Create group modal
- `components/sheets/JoinKhatmSheet.tsx` — Join group modal
- `components/sheets/JuzDetailSheet.tsx` — Juz detail view
- `components/sheets/ParticipantDetailSheet.tsx` — Participant detail view
- `components/home/HomeHeader.tsx` — Home header component
- `components/home/SettingsPanel.tsx` — Settings panel
- `components/home/SettingsDropdown.tsx` — Settings dropdown

### Lessons File

- `c:\Users\zamir\OneDrive\Desktop\spec\.claude\specs\lessons.json` — 22 lessons from `quran-recitation-tracker` spec, several applicable to Khatm

---

## Appendix B: Notification System (Complete)

### 12 Notification Types

| Code | Trigger | Recipient | Channels | Message Template Key |
|------|---------|-----------|----------|---------------------|
| N-01 | Invite not joined after 3 days | Invitee | WHATSAPP, SMS, EMAIL | `N_01_INVITE_NOT_JOINED_3D` |
| N-02 | Invite not joined after 5 days | ADMIN | PUSH | (not yet in scheduler) |
| N-03 | Juz assigned, not started after 3 days | Participant | WHATSAPP, PUSH | `N_03_JUZ_NOT_STARTED_3D` |
| N-04 | Juz not started after 5 days | ADMIN | PUSH | (not yet in scheduler) |
| N-05 | In-progress, no update for 4 days | Participant | WHATSAPP, PUSH | `N_05_IN_PROGRESS_NO_UPDATE_4D` |
| N-06 | In-progress, no update for 7 days | Both | ALL channels | (not yet in scheduler) |
| N-07 | 7 days before deadline | Participant | WHATSAPP, EMAIL, PUSH | `N_07_DEADLINE_7D` |
| N-08 | 3 days before deadline | Participant | WHATSAPP, SMS, PUSH | `N_08_DEADLINE_3D` |
| N-09 | 24 hours before deadline | Both | ALL channels | `N_09_DEADLINE_24H` |
| N-10 | Deadline passed, incomplete | ADMIN | PUSH, EMAIL | (not yet in scheduler) |
| N-11 | Any participant marks 100% | All members | PUSH | `N_11_JUZ_COMPLETED` |
| N-12 | All 30 Juz complete | All members | ALL channels | `N_12_ALL_JUZ_COMPLETED` |

### WhatsApp Message Templates

```
N_01_INVITE_NOT_JOINED_3D:
"As-salamu alaykum {name} 🌙\n\nYou were invited to join *{groupTitle}* {days} days ago.\n\nJoin here (no app needed): {webUrl}\n\nBismillah 🤲"

N_03_JUZ_NOT_STARTED_3D:
"As-salamu alaykum {name} 🌙\n\nYour Juz *{juzNum}* in *{groupTitle}* is waiting for you!\n\nThe group is counting on you. Open the app to start reading.\n\nMay Allah make it easy for you 🤲"

N_05_IN_PROGRESS_NO_UPDATE_4D:
"As-salamu alaykum {name} 🌙\n\nJust checking in — how is your reading of Juz *{juzNum}* going in *{groupTitle}*?\n\nUpdate your progress so the group knows you're on track 📖"

N_07_DEADLINE_7D:
"As-salamu alaykum {name} 🌙\n\n*{groupTitle}* has *{daysLeft} days* remaining!\n\nMake sure your Juz *{juzNum}* is complete before the deadline. Barakallahu feekum 🤲"

N_08_DEADLINE_3D:
"As-salamu alaykum {name} 🌙\n\n⚠️ Only *{daysLeft} days* left in *{groupTitle}*!\n\nYour Juz *{juzNum}* needs to be completed soon. You've got this! 🤲"

N_09_DEADLINE_24H:
"⚠️ *Final reminder* — {groupTitle} ends in less than 24 hours!\n\nYour Juz *{juzNum}* is still incomplete. Please finish or let *{adminName}* know so it can be reassigned.\n\nAllah makes all things easy 🤲"

N_11_JUZ_COMPLETED:
"🎉 Alhamdulillah! *{name}* just completed Juz *{juzNum}* in *{groupTitle}*!\n\nMay Allah accept it from them and from all of us. 🤲"

N_12_ALL_JUZ_COMPLETED:
"🎉 الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ\n\n*{groupTitle}* is COMPLETE! All 30 Juz have been read.\n\nMay Allah accept this blessed Khatm from everyone who participated. Ameen 🤲"
```

---

## Appendix C: React Query Hooks Summary

**Source:** `c:\Users\zamir\OneDrive\Desktop\Group-khatm\apps\mobile\src\hooks\useKhatm.ts`

```typescript
// Query key factory
export const QK = {
  myKhatms:     () => ['my-khatms'] as const,
  group:        (id: string) => ['group', id] as const,
  participants: (groupId: string) => ['participants', groupId] as const,
  juzGrid:      (groupId: string) => ['juz-grid', groupId] as const,
  auditLog:     (groupId: string) => ['audit-log', groupId] as const,
};

useMyKhatms()           → KhatmSwitcherCard[]    (staleTime: 30s)
useJuzGrid(groupId)     → JuzTileData[]          (30 tiles, enabled when groupId exists)
useJuzGridRealtime(groupId) → void               (realtime subscription, cleanup on unmount)
useParticipants(groupId)    → Participant[]      (JOINED only, ordered by role ASC)
useUpdateProgress()         → mutation           (updates progress_percent, inserts ledger)
useAssignJuz()              → mutation           (ADMIN/CO_ADMIN only, upserts assignment)
useAssignRole()             → mutation           (ADMIN only, updates role, inserts audit_log)
```

---

## Appendix D: Zustand Store

**Source:** `c:\Users\zamir\OneDrive\Desktop\Group-khatm\apps\mobile\src\hooks\useKhatmStore.ts`

```typescript
interface KhatmStore {
  activeKhatm: KhatmSwitcherCard | null;
  myRole: 'ADMIN' | 'CO_ADMIN' | 'PARTICIPANT';
  setActiveKhatm: (khatm: KhatmSwitcherCard) => void;
  clearActiveKhatm: () => void;
}

// Persistence: MMKV (synchronous), key: 'active-khatm-storage'
// Used in: KhatmHubBar, ManageKhatmsScreen, HomeScreen
```
