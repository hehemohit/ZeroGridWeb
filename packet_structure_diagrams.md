# 📡 ZeroGrid Packet Architecture & Protocol Specification

> [!IMPORTANT]
> ZeroGrid operates on a **Dual-Transport Protocol**. Every emergency dispatch automatically fans out across both an **Offline P2P Mesh Frame** (via BLE / Wi-Fi Direct / 868MHz) and an **Online REST/WebSocket Packet** (via HTTPS & Socket.io).

---

## 1. End-to-End Packet Lifecycle

```mermaid
flowchart TB
    %% Styling
    classDef client fill:#1E293B,stroke:#38BDF8,stroke-width:2px,color:#F8FAFC;
    classDef mesh fill:#312E81,stroke:#818CF8,stroke-width:2px,color:#F8FAFC;
    classDef api fill:#064E3B,stroke:#34D399,stroke-width:2px,color:#F8FAFC;
    classDef admin fill:#701A75,stroke:#F0ABFC,stroke-width:2px,color:#F8FAFC;

    subgraph SENDER ["📱 Sender Device (Android)"]
        A["🚨 SOS Triggered"]:::client
        B["UnifiedSosDispatcher"]:::client
        A --> B
    end

    subgraph MESH_NET ["📡 Offline P2P Mesh Transport (Zero Internet)"]
        C["MeshRoutingEngine (TTL=10)"]:::mesh
        D["BLE / Wi-Fi Direct Frame"]:::mesh
        E["868MHz Gateway Relay"]:::mesh
        B -->|Offline RF Broadcast| C
        C --> D
        D --> E
    end

    subgraph ONLINE_NET ["🌐 Online Cloud Infrastructure (Render MERN)"]
        F["POST /api/sos (HTTPS)"]:::api
        G["Node.js Express API"]:::api
        H[(MongoDB GeoJSON 2dsphere)]:::api
        I["Firebase Admin SDK (FCM)"]:::api
        
        B -->|Online HTTPS Dispatch| F
        F --> G
        G --> H
        G --> I
    end

    subgraph RECEIVERS ["🖥️ Emergency Handlers & Dashboard"]
        J["Socket.io /sos Namespace"]:::admin
        K["React Admin Dashboard Map"]:::admin
        L["Emergency Contacts (FCM Push)"]:::admin

        G -->|sos:new Broadcast| J
        J --> K
        I -->|High-Priority Push| L
    end
```

---

## 2. P2P Offline Mesh Frame Layout (Byte-Level RF Packet)

Below is the binary packet layout transmitted over **Bluetooth Low Energy (BLE)** and **Wi-Fi Direct** with zero internet connection:

```mermaid
gantt
    title P2P BLE Mesh Packet Header & Payload Bitmask (32-Bit Word Alignment)
    dateFormat X
    axisFormat %s

    section Word 0
    Magic Byte (0x5A "ZG")        :0, 8
    Packet Type (0x01 SOS)         :8, 16
    TTL Hop Count (Max 10)         :16, 24
    Battery Level (0-100%)         :24, 32

    section Word 1
    Sender Node ID Hash (Bytes 4-7) :32, 64

    section Word 2
    Target Addr (0xFFFFFFFF Broadcast) :64, 96

    section Word 3
    Latitude (IEEE 754 Float32)     :96, 128

    section Word 4
    Longitude (IEEE 754 Float32)    :128, 160

    section Word 5
    Accuracy Meters (Float16)      :160, 176
    Category Enum (3 Bits)         :176, 184
    Payload Length (Bytes)         :184, 192
    Reserved Flags                 :192, 208

    section Payload
    UTF-8 Encoded Message Payload  :208, 272
    CRC-32 Integrity Checksum      :272, 304
```

### Binary Header Field Matrix

| Offset (Bytes) | Field Name | Data Type | Size | Description / Valid Values |
| :--- | :--- | :--- | :--- | :--- |
| `0x00` | **Magic Header** | `uint8` | 1 Byte | Protocol Identifier (`0x5A` = ZeroGrid Frame) |
| `0x01` | **Packet Type** | `uint8` | 1 Byte | `0x01`: SOS Alert, `0x02`: Beacon, `0x03`: Ack, `0x04`: Peer Ping |
| `0x02` | **TTL Hop Count** | `uint8` | 1 Byte | Decremented at each relay node (Starts at `10`, dropped when `0`) |
| `0x03` | **Battery Level** | `uint8` | 1 Byte | Sender's current battery percentage (`0` to `100`) |
| `0x04 - 0x07` | **Sender Node Hash**| `uint32` | 4 Bytes | Truncated SHA-256 hash of sender public key or MAC |
| `0x08 - 0x0B` | **Target Address** | `uint32` | 4 Bytes | Destination Node ID (`0xFFFFFFFF` for mesh-wide broadcast) |
| `0x0C - 0x0F` | **Latitude** | `float32`| 4 Bytes | Signed WGS84 GPS Latitude coordinate |
| `0x10 - 0x13` | **Longitude** | `float32`| 4 Bytes | Signed WGS84 GPS Longitude coordinate |
| `0x14 - 0x15` | **Accuracy** | `uint16` | 2 Bytes | GPS accuracy radius in meters |
| `0x16` | **Category** | `uint8` | 1 Byte | `0`: OTHER, `1`: MEDICAL, `2`: DISASTER, `3`: TRAPPED, `4`: SECURITY |
| `0x17` | **Payload Length** | `uint8` | 1 Byte | Length of variable string payload (0–64 Bytes) |
| `Var` | **Message Payload** | `string` | 0-64 B | UTF-8 encoded user alert text |
| `End - 4` | **CRC-32** | `uint32` | 4 Bytes | Frame validation integrity checksum |

---

## 3. Dual-Dispatch Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as 🚨 Citizen User
    participant App as 📱 Android App
    participant Mesh as 📡 BLE Mesh Peers
    participant Server as ⚙️ Express Backend
    participant DB as 💾 MongoDB GeoJSON
    participant WS as 💻 Admin Live Map (Socket.io)
    participant FCM as 🔔 FCM Push Engine

    User->>App: Press SOS Button
    
    par Dual-Dispatch Parallel Execution
        App->>Mesh: Broadcast BLE Mesh Frame (TTL=10)
        Mesh-->>Mesh: Hop to adjacent nodes (P2P Relay)
    and Online Request
        App->>Server: POST /api/sos { lat, lng, category, message, batteryPercentage }
    end

    alt Internet Connected
        Server->>DB: Save SosEvent with GeoJSON 2dsphere Point
        Server->>WS: Emit 'sos:new' to /sos namespace
        WS-->>WS: Render New Marker & Trigger Spring Bounce Animation
        Server->>FCM: Dispatch High-Priority Push to Emergency Contacts
        Server-->>App: Return 201 Created { token, sos }
    else Internet Disconnected (Offline Queue)
        App->>App: Queue POST request in WorkManager DB
        Note over App,Server: Retries automatically when network recovers
    end
```

---

## 4. Online WebSocket Packet Structure (`/sos` Namespace)

When a new SOS event is created or updated, the Node.js server broadcasts the following JSON packet over **Socket.io** (`wss://zerogridweb.onrender.com/sos`):

```mermaid
classDiagram
    class SosSocketPacket {
        +String id
        +TriggeredByUser triggeredBy
        +GeoJsonPoint location
        +Number accuracyMeters
        +String category
        +String message
        +String transport
        +Number batteryPercentage
        +String status
        +List~SosAckUser~ acknowledgedByUsers
        +Boolean isAcknowledgedByMe
        +List~SosNote~ notes
        +DateTime createdAt
        +DateTime updatedAt
    }

    class TriggeredByUser {
        +String id
        +String displayName
        +String email
        +String role
    }

    class GeoJsonPoint {
        +String type = "Point"
        +List~Number~ coordinates = [lng, lat]
    }

    class SosAckUser {
        +String userId
        +String displayName
        +Boolean confirmedSafe
        +DateTime acknowledgedAt
    }

    class SosNote {
        +String authorId
        +String text
        +DateTime timestamp
    }

    SosSocketPacket --> TriggeredByUser
    SosSocketPacket --> GeoJsonPoint
    SosSocketPacket --> SosAckUser
    SosSocketPacket --> SosNote
```

---

## 5. FCM Push Notification Packet Structure

> [!TIP]
> Google Firebase Cloud Messaging (FCM) delivers high-priority heads-up notifications directly to registered emergency contacts.

```mermaid
json
{
  "notification": {
    "title": "🚨 Emergency SOS Alert",
    "body": "Jane Doe triggered a MEDICAL emergency. Immediate assistance requested."
  },
  "data": {
    "sosId": "6651c89f2a4b123456789abc",
    "category": "MEDICAL",
    "lat": "19.0760",
    "lng": "72.8777",
    "accuracy": "12.5",
    "battery": "84",
    "timestamp": "1758852600000"
  }
}
```
