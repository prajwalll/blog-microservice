# 📝 Microservices Blog App — Deep Dive

A hands-on learning project to understand **Microservices Architecture** using Node.js, Express, and an in-memory Event Bus. The project simulates a blog platform where users can create posts and comments — with a full event-driven pipeline including moderation, query aggregation, and async communication.

---

## 📁 Project Structure

```
blog-1/
├── client/          → React frontend (Vite)
├── posts/           → Posts Service     (port 4000)
├── comments/        → Comments Service  (port 4001)
├── query/           → Query Service     (port 4002)
├── moderation/      → Moderation Service(port 4003)
└── event-bus/       → Event Bus         (port 4005)
```

---

## 🏗️ Architecture Overview

```
         React Client
              │
    ┌─────────┴──────────┐
    │                    │
POST /posts         POST /posts/:id/comments
    │                    │
Posts Service       Comments Service
(port 4000)         (port 4001)
    │                    │
    └────────┬───────────┘
             │  emits events
             ▼
         Event Bus
         (port 4005)
             │
   ┌─────────┼──────────┬──────────┐
   ▼         ▼          ▼          ▼
Posts     Comments   Query     Moderation
Service   Service    Service   Service
(4000)    (4001)     (4002)    (4003)
```

Each service is **completely independent**. They don't call each other directly — they speak only through the Event Bus.

---

## 🚀 Services — Detailed Walkthrough

---

### 1. 📌 Posts Service — `port 4000`

**Responsibility:** Create and store blog posts. Notify other services when a post is created.

#### Endpoints

| Method | Route | What it does |
|--------|-------|--------------|
| `GET`  | `/posts` | Returns all posts stored in memory |
| `POST` | `/posts` | Creates a new post, fires `PostCreated` event |
| `POST` | `/events` | Receives events from the Event Bus (currently just logs them) |

#### Flow — Creating a Post

```
Client
  │
  │  POST /posts  { title: "My First Post" }
  ▼
Posts Service
  │  1. Generates a random ID (e.g. "a3f9bc12")
  │  2. Saves: posts["a3f9bc12"] = { id, title }
  │  3. Calls Event Bus:
  │     POST http://localhost:4005/events
  │     { type: "PostCreated", data: { id, title } }
  ▼
Event Bus
  │  Broadcasts PostCreated to all services
  ▼
Query Service
     Receives PostCreated → adds post to its local store
```

#### Data Shape

```js
posts = {
  "a3f9bc12": { id: "a3f9bc12", title: "My First Post" }
}
```

---

### 2. 💬 Comments Service — `port 4001`

**Responsibility:** Create and store comments for a given post. Handle moderation outcomes.

#### Endpoints

| Method | Route | What it does |
|--------|-------|--------------|
| `GET`  | `/posts/:id/comments` | Returns comments for a specific post |
| `POST` | `/posts/:id/comments` | Creates a comment, emits `CommentCreated` |
| `POST` | `/events` | Handles `CommentModerated` → updates status → emits `CommentUpdated` |

#### Flow — Creating a Comment

```
Client
  │
  │  POST /posts/a3f9bc12/comments  { content: "Nice post!" }
  ▼
Comments Service
  │  1. Generates random commentId
  │  2. Sets initial status: "pending"
  │  3. Saves locally: commentsByPostId["a3f9bc12"] = [{ id, content, status: "pending" }]
  │  4. Emits to Event Bus:
  │     { type: "CommentCreated", data: { id, content, postId, status: "pending" } }
  ▼
Event Bus
  │  Broadcasts to all services
  ├──▶ Moderation Service — decides approved/rejected
  └──▶ Query Service — adds comment to its post snapshot
```

#### Flow — Receiving Moderation Result

```
Event Bus
  │
  │  { type: "CommentModerated", data: { postId, id, status: "approved", content } }
  ▼
Comments Service  (/events handler)
  │  1. Finds the comment by postId + commentId
  │  2. Updates comment.status = "approved"
  │  3. Re-emits to Event Bus:
  │     { type: "CommentUpdated", data: { id, status, postId, content } }
  ▼
Event Bus
  │
  ▼
Query Service
     Updates the comment's status in its snapshot
```

#### Data Shape

```js
commentsByPostId = {
  "a3f9bc12": [
    { id: "d1e2f3a4", content: "Nice post!", status: "approved" }
  ]
}
```

---

### 3. 🚌 Event Bus — `port 4005`

**Responsibility:** Central nervous system. Receives an event from any service and fans it out to all others. Also stores all past events for replay.

#### Endpoints

| Method | Route | What it does |
|--------|-------|--------------|
| `POST` | `/events` | Receives an event, stores it, fans out to all services |
| `GET`  | `/events` | Returns all historical events (used by Query Service on startup) |

#### Flow — Broadcasting an Event

```
Any Service
  │
  │  POST /events  { type: "PostCreated", data: {...} }
  ▼
Event Bus
  │  1. Stores event in memory: events.push(event)
  │  2. Calls ALL services in parallel:
  │     - POST http://localhost:4000/events
  │     - POST http://localhost:4001/events
  │     - POST http://localhost:4002/events
  │     - POST http://localhost:4003/events
  │  3. Uses Promise.allSettled (won't crash if one service is down)
  │  4. Logs which services failed
  └──▶ Returns { status: "OK" }
```

> **Why `Promise.allSettled` instead of `Promise.all`?**
> `Promise.all` fails fast — if one service is down, the rest never receive the event.
> `Promise.allSettled` fires all requests and collects results, so one failure doesn't block others.

#### Stored Events Example

```js
events = [
  { type: "PostCreated",      data: { id: "a3f9bc12", title: "My Post" } },
  { type: "CommentCreated",   data: { id: "d1e2f3a4", content: "Nice!", postId: "a3f9bc12", status: "pending" } },
  { type: "CommentModerated", data: { id: "d1e2f3a4", postId: "a3f9bc12", status: "approved", content: "Nice!" } },
  { type: "CommentUpdated",   data: { id: "d1e2f3a4", status: "approved", postId: "a3f9bc12", content: "Nice!" } }
]
```

---

### 4. 🔍 Query Service — `port 4002`

**Responsibility:** Maintains a **pre-joined, up-to-date snapshot** of posts + their comments. The React frontend fetches from here — not from Posts or Comments service directly.

This solves the **JOIN problem**: if the frontend asked Posts for posts and Comments for comments separately, it would need N+1 requests. Query solves this by listening to events and building one unified view.

#### Endpoints

| Method | Route | What it does |
|--------|-------|--------------|
| `GET`  | `/posts` | Returns all posts with embedded comments |
| `POST` | `/events` | Handles PostCreated, CommentCreated, CommentUpdated |

#### Event Handlers

```js
// PostCreated → Register a new post with empty comments array
if (type === "PostCreated") {
  posts[id] = { id, title, comments: [] };
}

// CommentCreated → Add comment to the correct post
if (type === "CommentCreated") {
  posts[postId].comments.push({ id, content, status });
}

// CommentUpdated → Find and update that comment's status/content
if (type === "CommentUpdated") {
  const comment = posts[postId].comments.find(c => c.id === id);
  comment.status = status;
  comment.content = content;
}
```

#### Startup Replay (Event Sync)

```js
app.listen(4002, async () => {
  // On startup, fetch ALL past events from the Event Bus
  const res = await axios.get("http://localhost:4005/events");

  for (let event of res.data) {
    handleEvent(event.type, event.data);
  }
});
```

> **Why is this important?**
> If the Query service crashes and restarts, it has no memory. By replaying all stored events from the Event Bus, it rebuilds its full state without needing any other service to re-emit.

#### Data Shape

```js
posts = {
  "a3f9bc12": {
    id: "a3f9bc12",
    title: "My First Post",
    comments: [
      { id: "d1e2f3a4", content: "Nice post!", status: "approved" }
    ]
  }
}
```

---

### 5. 🛡️ Moderation Service — `port 4003`

**Responsibility:** Auto-moderate comments based on content rules. Currently rejects any comment containing the word `"orange"`.

#### Endpoints

| Method | Route | What it does |
|--------|-------|--------------|
| `POST` | `/events` | Handles `CommentCreated` → determines status → emits `CommentModerated` |

#### Flow

```
Event Bus
  │
  │  { type: "CommentCreated", data: { id, postId, content: "I love orange!" } }
  ▼
Moderation Service
  │  1. Checks: content.includes("orange") → status = "rejected"
  │             else → status = "approved"
  │  2. Emits CommentModerated:
  │     POST http://localhost:4005/events
  │     { type: "CommentModerated", data: { id, postId, status: "rejected", content } }
  ▼
Event Bus
  │
  ▼
Comments Service
     Updates comment status, re-emits CommentUpdated
  ▼
Query Service
     Updates the snapshot
```

---

## 🔄 Complete End-to-End Flow

Here is the **full lifecycle** of a comment from creation to rendering on screen:

```
1.  User types comment "Great article!" → React calls:
    POST http://localhost:4001/posts/a3f9bc12/comments

2.  Comments Service:
    - Saves comment with status "pending"
    - Emits: { type: "CommentCreated", data: { id, content, postId, status: "pending" } }
    - Returns comment list to React (status: "pending")

3.  Event Bus receives CommentCreated → fans out to all 4 services

4.  Query Service receives CommentCreated:
    - Adds comment to posts["a3f9bc12"].comments with status "pending"

5.  Moderation Service receives CommentCreated:
    - "Great article!" → no "orange" → status = "approved"
    - Emits: { type: "CommentModerated", data: { ..., status: "approved" } }

6.  Event Bus receives CommentModerated → fans out again

7.  Comments Service receives CommentModerated:
    - Updates stored comment status to "approved"
    - Emits: { type: "CommentUpdated", data: { ..., status: "approved" } }

8.  Event Bus receives CommentUpdated → fans out again

9.  Query Service receives CommentUpdated:
    - Updates comment in snapshot from "pending" → "approved"

10. React polls GET http://localhost:4002/posts
    → Gets posts with comments showing status "approved"
    → Renders comment (hidden if "pending", shown if "approved", flagged if "rejected")
```

---

## ▶️ Running the Project

Start each service in its own terminal:

```bash
# Terminal 1
cd event-bus && node index.js

# Terminal 2
cd posts && node index.js

# Terminal 3
cd comments && node index.js

# Terminal 4
cd query && node index.js

# Terminal 5
cd moderation && node index.js

# Terminal 6
cd client && npm run dev
```

> ⚠️ Start the **Event Bus first** — all other services depend on it being reachable.

---

## 🔧 Why This Architecture?

| Problem | Solution Used |
|---------|--------------|
| Services need to notify each other | Event Bus (pub/sub pattern) |
| Frontend needs joined data | Query Service (read model) |
| Service restarts lose state | Event replay on startup |
| One service failure shouldn't block others | `Promise.allSettled` in Event Bus |
| Comments need approval workflow | Moderation Service listens to events asynchronously |

---

## ⚡ Upgrading to Apache Kafka

Right now, the Event Bus is a **hand-rolled, in-memory service**. It works for learning, but has serious limitations in production:

- If the Event Bus process crashes, all buffered events are **lost forever**
- It can only handle as many events as one Node.js process can manage
- No consumer groups — if you add a second instance of Query Service, both get every event and double-process
- No guaranteed delivery ordering across partitions
- Zero fault tolerance

**Apache Kafka** solves all of these. Here's how the same system maps to Kafka concepts:

---

### Kafka Concept Mapping

| Current (Manual) | Kafka Equivalent |
|------------------|-----------------|
| `events.push(event)` in Event Bus | Kafka **Topic** (persistent log on disk) |
| `axios.post(serviceUrl, event)` | Kafka **Producer** publishes to a topic |
| Each service's `/events` endpoint | Kafka **Consumer** subscribes to topics |
| `GET /events` on startup replay | Kafka **offset reset** (`--from-beginning`) |
| All services on one machine | Kafka **Broker cluster** across machines |

---

### Installing Kafka Packages

```bash
# In each service that needs to produce or consume
npm install kafkajs
```

---

### Setting Up the Kafka Client (shared config)

```js
// kafka.js (shared utility)
const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "blog-app",
  brokers: ["localhost:9092"],  // your Kafka broker address
});

module.exports = kafka;
```

---

### Posts Service — Producer (replaces axios.post to event bus)

```js
// posts/index.js
const kafka = require("./kafka");

const producer = kafka.producer();

// Connect once at startup
async function startProducer() {
  await producer.connect();
}
startProducer();

app.post("/posts", async (req, res) => {
  const id = randomBytes(4).toString("hex");
  const { title } = req.body;
  posts[id] = { id, title };

  // 🔄 BEFORE: axios.post("http://localhost:4005/events", { type: "PostCreated", data: { id, title } })
  // ✅ AFTER: publish to Kafka topic
  await producer.send({
    topic: "post-created",          // Kafka topic name (replaces event "type")
    messages: [
      {
        key: id,                    // Used for ordering — same key → same partition
        value: JSON.stringify({ id, title }),
      },
    ],
  });

  res.status(201).send(posts[id]);
});
```

---

### Comments Service — Producer + Consumer

```js
// comments/index.js
const kafka = require("./kafka");

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: "comments-service" });

async function start() {
  await producer.connect();
  await consumer.connect();

  // Subscribe to the moderation result topic
  await consumer.subscribe({ topic: "comment-moderated", fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const { id, postId, status, content } = JSON.parse(message.value.toString());

      // Same logic as the old /events POST handler
      const comments = commentsByPostId[postId];
      const comment = comments.find(c => c.id === id);
      comment.status = status;

      // Re-emit CommentUpdated
      await producer.send({
        topic: "comment-updated",
        messages: [{ key: id, value: JSON.stringify({ id, status, postId, content }) }],
      });
    },
  });
}

start();

// Creating a comment → publish to Kafka
app.post("/posts/:id/comments", async (req, res) => {
  const commentId = randomBytes(4).toString("hex");
  const { content } = req.body;

  const comments = commentsByPostId[req.params.id] || [];
  comments.push({ id: commentId, content, status: "pending" });
  commentsByPostId[req.params.id] = comments;

  await producer.send({
    topic: "comment-created",
    messages: [
      {
        key: commentId,
        value: JSON.stringify({ id: commentId, content, postId: req.params.id, status: "pending" }),
      },
    ],
  });

  res.status(201).send(comments);
});
```

---

### Moderation Service — Consumer + Producer

```js
// moderation/index.js
const kafka = require("./kafka");

const consumer = kafka.consumer({ groupId: "moderation-service" });
const producer = kafka.producer();

async function start() {
  await producer.connect();
  await consumer.connect();

  await consumer.subscribe({ topic: "comment-created", fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const { id, postId, content } = JSON.parse(message.value.toString());

      const status = content.includes("orange") ? "rejected" : "approved";

      await producer.send({
        topic: "comment-moderated",
        messages: [
          {
            key: id,
            value: JSON.stringify({ id, postId, status, content }),
          },
        ],
      });
    },
  });
}

start();
```

---

### Query Service — Consumer (replaces /events endpoint + startup replay)

```js
// query/index.js
const kafka = require("./kafka");

const consumer = kafka.consumer({ groupId: "query-service" });

async function start() {
  await consumer.connect();

  // Subscribe to all relevant topics
  await consumer.subscribe({ topic: "post-created",     fromBeginning: true });
  await consumer.subscribe({ topic: "comment-created",  fromBeginning: true });
  await consumer.subscribe({ topic: "comment-updated",  fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const data = JSON.parse(message.value.toString());

      if (topic === "post-created") {
        posts[data.id] = { id: data.id, title: data.title, comments: [] };
      }

      if (topic === "comment-created") {
        posts[data.postId].comments.push({ id: data.id, content: data.content, status: data.status });
      }

      if (topic === "comment-updated") {
        const comment = posts[data.postId].comments.find(c => c.id === data.id);
        comment.status = data.status;
        comment.content = data.content;
      }
    },
  });
}

start();

// /posts GET endpoint stays the same — serves the in-memory snapshot
app.get("/posts", (req, res) => res.send(posts));
```

> **Note on `fromBeginning: true`**
> This replaces the manual startup replay (`axios.get("http://localhost:4005/events")`).
> Kafka stores every message on disk. Setting `fromBeginning: true` means when a consumer starts (or restarts), it reads **all messages from offset 0**, rebuilding state automatically.

---

### The Event Bus Service — Gone ✅

With Kafka, you **delete the Event Bus service entirely**. Kafka itself becomes the bus. Each service produces to named topics, each service consumes from the topics it cares about.

---

### Kafka Flow Diagram

```
Posts Service ──produces──▶ [post-created topic]
                                     │
                          ┌──────────┘
                          ▼
                    Query Service (consumer)

Comments Service ──produces──▶ [comment-created topic]
                                        │
                          ┌─────────────┴──────────────┐
                          ▼                             ▼
                    Query Service               Moderation Service
                    (consumer)                  (consumer)
                                                        │
                                            produces ───▶ [comment-moderated topic]
                                                                    │
                                                         Comments Service (consumer)
                                                                    │
                                             produces ──▶ [comment-updated topic]
                                                                    │
                                                         Query Service (consumer)
```

---

### Key Kafka Advantages Over This Project's Manual Bus

| Feature | Manual Event Bus | Apache Kafka |
|---------|-----------------|--------------|
| Persistence | RAM only (lost on crash) | Disk (configurable retention) |
| Replay on restart | Manual `GET /events` + loop | Automatic via `fromBeginning: true` |
| Scale producers/consumers | Single Node.js process | Distributed, horizontal scaling |
| Ordering guarantee | Best effort | Guaranteed per partition/key |
| Consumer groups | Not supported | Built-in (multiple instances, one processes each message) |
| Backpressure handling | None | Kafka manages consumer lag |
| Dead letter queue | None | Supported via error topics |

---

## 📚 Summary

This project demonstrates the core ideas behind microservices:

1. **Services own their data** — Posts service owns post storage, Comments service owns comment storage
2. **Communication via events** — services don't call each other, they emit events
3. **Query models** — the Query service pre-joins data so the frontend only makes one request
4. **Event replay** — services can rebuild state from scratch by replaying history
5. **Independent deployability** — any service can restart without breaking the others

Moving to Kafka takes the same mental model — producers, consumers, topics — and makes it production-grade with persistence, scale, and fault tolerance baked in.
