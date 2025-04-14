# SuperGrok Database Schema

This document outlines the database schema for the SuperGrok application, describing the tables, relationships, and key concepts.

## Entity Relationship Diagram

```
┌─────────────┐       ┌───────────────┐       ┌──────────────────┐
│   users     │       │ user_profiles │       │   conversations  │
├─────────────┤       ├───────────────┤       ├──────────────────┤
│ id (PK)     │──1:1──┤ id (PK)       │       │ id (PK)          │
│ email       │       │ user_id (FK)  │──1:N──┤ user_id (FK)     │
│ created_at  │       │ username      │       │ title            │
│ updated_at  │       │ avatar_url    │       │ description      │
└─────────────┘       │ preferences   │       │ metadata         │
                      │ created_at    │       │ root_message_id  │
                      │ updated_at    │       │ created_at       │
                      └───────────────┘       │ updated_at       │
                                              └────────┬─────────┘
                                                       │
                                                       │
                      ┌────────────────────┐          │
                      │ conversation_messages          │
                      ├────────────────────┤          │
                      │ id (PK)            │          │
                      │ conversation_id (FK)◄─────────┘
                      │ branch_id (FK)     │◄─┐
                      │ parent_message_id  │  │
                      │ role               │  │
                      │ content            │  │
                      │ selected_text      │  │
                      │ metadata           │  │
                      │ thinking_content   │  │
                      │ created_at         │  │
                      │ updated_at         │  │
                      └────────────────────┘  │
                                              │
                                              │
                      ┌────────────────────┐  │
                      │ conversation_branches │
                      ├────────────────────┤  │
                      │ id (PK)            │──┘
                      │ conversation_id (FK)│
                      │ parent_branch_id   │
                      │ name               │
                      │ description        │
                      │ created_at         │
                      │ updated_at         │
                      └────────────────────┘
```

## Tables

### users

Stores basic user information, linked to Supabase Auth.

| Column      | Type      | Description                   |
|-------------|-----------|-------------------------------|
| id          | UUID      | Primary key, matches auth.id  |
| email       | TEXT      | User's email address          |
| created_at  | TIMESTAMP | Record creation timestamp     |
| updated_at  | TIMESTAMP | Record last update timestamp  |

### user_profiles

Stores additional user profile information.

| Column      | Type      | Description                      |
|-------------|-----------|----------------------------------|
| id          | UUID      | Primary key                      |
| user_id     | UUID      | Foreign key to users.id          |
| username    | TEXT      | Optional username                |
| avatar_url  | TEXT      | URL to user's avatar image       |
| preferences | JSONB     | User preferences in JSON format  |
| created_at  | TIMESTAMP | Record creation timestamp        |
| updated_at  | TIMESTAMP | Record last update timestamp     |

### conversations

Represents a chat conversation with its messages.

| Column        | Type      | Description                         |
|---------------|-----------|-------------------------------------|
| id            | UUID      | Primary key                         |
| user_id       | UUID      | Foreign key to users.id             |
| title         | TEXT      | Conversation title                  |
| description   | TEXT      | Optional description                |
| metadata      | JSONB     | Additional data in JSON format      |
| root_message_id| UUID      | ID of first message (nullable)      |
| created_at    | TIMESTAMP | Record creation timestamp           |
| updated_at    | TIMESTAMP | Record last update timestamp        |

### conversation_branches

Represents branches in the conversation tree.

| Column           | Type      | Description                          |
|------------------|-----------|--------------------------------------|
| id               | UUID      | Primary key                          |
| conversation_id  | UUID      | Foreign key to conversations.id      |
| parent_branch_id | UUID      | Self-reference to parent branch      |
| name             | TEXT      | Optional branch name                 |
| description      | TEXT      | Optional branch description          |
| created_at       | TIMESTAMP | Record creation timestamp            |
| updated_at       | TIMESTAMP | Record last update timestamp         |

### conversation_messages

Stores individual messages in conversations.

| Column            | Type      | Description                              |
|-------------------|-----------|------------------------------------------|
| id                | UUID      | Primary key                              |
| conversation_id   | UUID      | Foreign key to conversations.id          |
| branch_id         | UUID      | Foreign key to conversation_branches.id  |
| parent_message_id | UUID      | Self-reference to parent message         |
| role              | TEXT      | Message role (user/assistant/system)     |
| content           | TEXT      | Message content                          |
| selected_text     | TEXT      | Text selected for branch (if applicable) |
| metadata          | JSONB     | Additional data in JSON format           |
| thinking_content  | TEXT      | Content of thinking feature (optional)   |
| created_at        | TIMESTAMP | Record creation timestamp                |
| updated_at        | TIMESTAMP | Record last update timestamp             |

## Row-Level Security Policies

All tables have Row-Level Security (RLS) enabled with policies that ensure:

- Users can only access their own data
- Records can only be created, updated, or deleted by their owner
- Messages and branches are accessible only to the conversation owner

## Database Indexes

The following indexes improve query performance:

- `idx_user_profiles_user_id` on `user_profiles(user_id)`
- `idx_conversations_user_id` on `conversations(user_id)`
- `idx_conversation_branches_conversation_id` on `conversation_branches(conversation_id)`
- `idx_conversation_branches_parent_branch_id` on `conversation_branches(parent_branch_id)`
- `idx_conversation_messages_conversation_id` on `conversation_messages(conversation_id)`
- `idx_conversation_messages_branch_id` on `conversation_messages(branch_id)`
- `idx_conversation_messages_parent_message_id` on `conversation_messages(parent_message_id)`

## Utility Functions

A trigger function `trigger_set_updated_at()` automatically updates the `updated_at` timestamp whenever a record is modified.

## Schema Initialization

The schema can be initialized or reset by running the SQL script located in `db/migrations/schema.sql`. This script is idempotent and includes destructive commands at the beginning to reset the database if needed. 