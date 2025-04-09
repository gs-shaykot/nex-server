require('dotenv').config();
const express = require('express');
const cors = require('cors');
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
    origin: ['http://localhost:5173', 'https://nexcall-1425e.web.app', 'https://nexcall.up.railway.app'],
    credentials: true
}));

const io = new Server(server, {
    cors: {
        origin: ['http://localhost:5173', 'https://nexcall-1425e.web.app', 'https://nexcall.up.railway.app'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});


const roomUsers = {}

io.on("connection", (socket) => {
    console.log("Connected ID:", socket.id);

    // Create Room
    socket.on("createRoom", (userData) => {
        const roomId = Math.random().toString(36).substr(2, 6);
        socket.join(roomId);
        roomUsers[roomId] = [{ socketId: socket.id, ...userData }];
        socket.emit("RoomCreated", roomId);
        console.log("Room Created: ", roomId);
    });

    // Join Room 
    socket.on("JoinRoom", ({ roomId, userData }) => {
        socket.join(roomId);
        if (!roomUsers[roomId]) {
            roomUsers[roomId] = []
        }
        roomUsers[roomId].push({ socketId: socket.id, ...userData })
        socket.emit("RoomJoined", roomId);
        io.to(roomId).emit("updatedRoomUser", roomUsers[roomId])
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
            timestamp: new Date(),
        };
        io.to(room).emit("receiveMessage", { sender: socket.id, senderName, photo, message });

        // Save the message to the messages collection
        const messagesCollection = client.db("NexCall").collection('messages');
        await messagesCollection.insertOne(messageData);
    });

    // Handle Disconnect
    socket.on("disconnect", () => {
        for (let roomId in roomUsers) {
            roomUsers[roomId] = roomUsers[roomId].filter(user => user.socketId !== socket.id);
            io.to(roomId).emit("updatedRoomUser", roomUsers[roomId]);
        }
        console.log(`Disconnected user ID: ${socket.id}`);
    });
});


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

        // API to get all messages for a specific room
        app.get('/messages/:roomId', async (req, res) => {
            const roomId = req.params.roomId;
            const messages = await messagesCollection.find({ room: roomId }).toArray();
            res.send(messages);
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


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

server.listen(5000, () => {
    console.log(`Server running using Socket.io on http://localhost:${PORT}`)
})