require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios'); // Import axios for making HTTP requests
const { v4: uuidv4 } = require('uuid'); // Import uuid for generating unique IDs    
const app = express()
const http = require('http')
const { Server } = require('socket.io')
const server = http.createServer(app)
const PORT = process.env.PORT || 5000;
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

app.use(express.json());
app.use(cookieParser());

// Middleware 
app.use(cors({
    origin: ['http://localhost:5173', 'https://nexcall-1425e.web.app', 'http://localhost:5000'],
    credentials: true
}));

const io = new Server(server, {
    cors: {
        origin: ['http://localhost:5173', 'https://nexcall-1425e.web.app', 'http://localhost:5000'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});


const roomUsers = {}

io.on("connection", (socket) => {
    console.log("Connected ID:", socket.id);

    // Create Room
    socket.on("createRoom", async (userData) => {
        try {
            // 100ms room create 
            const roomResponse = await axios.post(
                "https://api.100ms.live/v2/rooms",
                {
                    name: `room-${socket.id}-${Date.now()}`, // ইউনিক নাম
                    description: "Dynamic room for NexCall",
                    template_id: process.env.HMS_TEMPLATE_ID, // 100ms ড্যাশবোর্ড থেকে নাও
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.HMS_MANAGEMENT_TOKEN}`,
                    },
                }
            );
            const roomId = roomResponse.data.id; // 100ms room id
            socket.join(roomId);
            roomUsers[roomId] = [{ socketId: socket.id, ...userData }];
            const { name, timestamp } = userData;
            socket.emit("RoomCreated", roomId, name, timestamp);
            console.log("Room Created: ", roomId);
        } catch (error) {
            console.error("Error creating 100ms room:", error);
            socket.emit("RoomCreationError", "Failed to create room");
        }
        // const roomId = Math.random().toString(36).substr(2, 6);
        // socket.join(roomId);
        // roomUsers[roomId] = [{ socketId: socket.id, ...userData }];
        // const { name, timestamp } = userData
        // socket.emit("RoomCreated", roomId, name, timestamp);
        // console.log("Room Created: ", roomId);
    });

    // Join Room 
    socket.on("JoinRoom", async ({ roomId, userData }) => {
        try {
            // 100ms room check 
            const roomResponse = await axios.get(
                `https://api.100ms.live/v2/rooms/${roomId}`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.HMS_MANAGEMENT_TOKEN}`,
                    },
                }
            );
            if (!roomResponse.data.id) {
                socket.emit("RoomJoinError", "Invalid room ID");
                return;
            }

            socket.join(roomId);
            if (!roomUsers[roomId]) {
                roomUsers[roomId] = [];
            }
            roomUsers[roomId].push({ socketId: socket.id, ...userData });
            socket.emit("RoomJoined", roomId);
            io.to(roomId).emit("updatedRoomUser", roomUsers[roomId]);
        } catch (error) {
            console.error("Error joining room:", error);
            socket.emit("RoomJoinError", "Failed to join room");
        }
        // socket.join(roomId);
        // if (!roomUsers[roomId]) {
        //     roomUsers[roomId] = []
        // }
        // roomUsers[roomId].push({ socketId: socket.id, ...userData })
        // socket.emit("RoomJoined", roomId);
        // io.to(roomId).emit("updatedRoomUser", roomUsers[roomId])
    });


    socket.on("getRoomUsers", (roomId) => {
        if (roomUsers[roomId]) {
            socket.emit("updatedRoomUser", roomUsers[roomId]);
        } else {
            socket.emit("updatedRoomUser", []); // Empty array if room doesn’t exist
        }
    });

    // Send Message
    socket.on("sentMessage", async ({ room, message, senderName, senderEmail, photo, receiverName }) => {
        const messageData = {
            room,
            message,
            photo,
            senderName,
            senderEmail,
            receiverName,
            timestamp: new Date()
        };
        io.to(room).emit("receiveMessage", { sender: socket.id, senderName, photo, message });

        // Save the message to the messages collection
        const messagesCollection = client.db("NexCall").collection('messages');
        await messagesCollection.insertOne(messageData);
    });

    // Handle Disconnect
    socket.on("disconnect", () => {
        for (roomId in roomUsers) {
            roomUsers[roomId] = roomUsers[roomId].filter(user => user.socketId !== socket.id)
            io.to(roomId).emit("updatedRoomUser", roomUsers[roomId])
        }
        console.log(`Disconnected user ID: ${socket.id}`);
    });
});

// 100ms token generate 
app.get('/token', async (req, res) => {
    try {
        const { roomId } = req.query;
        if (!roomId) {
            return res.status(400).json({ error: "Room ID is required" });
        }

        const tokenId = uuidv4(); // Generate a unique token ID
        // const tokenUrl = `https://api.100ms.live/v2/rooms/${roomId}/tokens`;
        const payload = {
            access_key: process.env.APP_ACCESS_KEY,
            room_id: roomId,
            user_id: `user-${Math.random().toString(36).substring(7)}`,
            role: "host", // অথবা guest, 100ms ড্যাশবোর্ডে রোল কনফিগার করো
            jwtid: tokenId,
        };

        const token = jwt.sign(payload, process.env.HMS_APP_SECRET, {
            expiresIn: "24h",
            algorithm: "HS256",
            jwtid: tokenId,
        });
        console.log("Generated token:", token);
        res.json({ token });
    } catch (error) {
        console.error("Error generating token:", error);
        res.status(500).json({ error: "Failed to generate token" });
    }
})

app.get('/', (req, res) => {
    res.send("NEXCALL SERVER RUNNING")
})

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { profile } = require('console');
const uri = `mongodb+srv://${process.env.db_user}:${process.env.db_pass}@cluster0.mvhtan2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// const uri = `mongodb+srv://${process.env.db_user}:${process.env.db_pass}@cluster0.x6oak.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // COLLECTIONS 
        const usersCollections = client.db("NexCall").collection('users');
        const messagesCollection = client.db("NexCall").collection('messages');
        // Schedule COLLECTION
        const scheduleCollection = client.db("NextCall").collection("schedule");


        // JWT AUTH ENDPOINTS
        app.post('/jwt', async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.JWT_SECRET, {
                expiresIn: '1h'
            })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: 'cookie created' })
        })
        app.get('/jwt', async (req, res) => {
            res.send("jwt /jwt working")
        })
        app.post('/jwtlogout', async (req, res) => {
            res
                .clearCookie('token', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: 'cookie cleared' })
        })
        app.get('/logout', async (req, res) => {
            res.send("jwt /logout working")
        })

        // TOKEN VERIFIER
        const verifyToken = (req, res, next) => {
            const token = req?.cookies?.token
            console.log("token: ", token)
            if (!token) {
                return res.status(401).send({ message: 'Token not found to verify' })
            }
            jwt.verify(token, process.env.jwt_Secret, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Unauthorization Error' })
                }
                req.user = decoded
                next()
            })
        }

        // Get all messages for a specific room APIs
        app.get('/messages/:roomId', async (req, res) => {
            const roomId = req.params.roomId;
            const messages = await messagesCollection.find({ room: roomId }).toArray();
            res.send(messages);
        });

        app.get("/conversations/user/:email", async (req, res) => {
            const { email } = req.params;

            // Find all rooms where user is sender or receiver
            const userRooms = await messagesCollection.aggregate([
                {
                    $match: {
                        $or: [
                            { senderEmail: email },
                            { receiverEmail: email }
                        ]
                    }
                },
                {
                    $group: {
                        _id: "$room"
                    }
                }
            ]).toArray();

            const roomIds = userRooms.map(r => r._id);

            // Fetch messages from those rooms without sorting inside each room
            const result = await messagesCollection.aggregate([
                {
                    $match: {
                        room: { $in: roomIds }
                    }
                },
                {
                    $group: {
                        _id: "$room",
                        messages: {
                            $push: {
                                message: "$message",
                                senderName: "$senderName",
                                receiverName: "$receiverName",
                                senderEmail: "$senderEmail",
                                receiverEmail: "$receiverEmail",
                                photo: "$photo",
                                timestamp: "$timestamp"
                            }
                        },
                        lastMessageTime: { $max: "$timestamp" }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        room: "$_id",
                        messages: 1,
                        lastMessageTime: 1
                    }
                },
                {
                    $sort: {
                        lastMessageTime: -1
                    }
                }
            ]).toArray();

            res.json(result);
        });



        // User API:
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollections.insertOne(user);
            res.send(result);
        });

        app.get('/users', async (req, res) => {
            const results = await usersCollections.find().toArray()
            res.send(results)
        })

        // Schedule 
        app.post("/schedule-collections", async (req, res) => {

            try {
                const scheduleResult = req.body;
                const result = await scheduleCollection.insertOne(scheduleResult);

                res.send(result);

            } catch (error) {
                console.log(error.message)
                res.send({ message: "This error from Schedule api" })
            }

        })
        // send schedule to front-end 
        app.get('/schedule-collections/:email', async (req, res) => {

            try {
                const email = req.params.email

                const result = await scheduleCollection.find({ email: email }).sort({ Date: 1 }).toArray();
                res.send(result)
            } catch
            (err) {
                console.log(err);
                res.send({ message: "This message from schedule-collections get method" })

            }



        })


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

server.listen(5000, () => {
    console.log(`Server running using Socket.io on http://localhost:${PORT}`)
})