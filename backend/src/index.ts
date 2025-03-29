import express, { Request, Response, NextFunction, Application, RequestHandler } from 'express';
import expressWS from 'express-ws';
import dotenv from 'dotenv';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt, { Secret, JwtPayload } from 'jsonwebtoken';
import mongoose from 'mongoose';
import { addMinutes, differenceInMilliseconds, hoursToMilliseconds, millisecondsToMinutes, minutesToMilliseconds } from 'date-fns'
import fileUpload, { UploadedFile } from 'express-fileupload';

//For env File 
dotenv.config();

const app: Application = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());
const wsApp = expressWS(app);
const port = process.env.PORT || 5000;

const jwt_secret: Secret = process.env.JWT_SECRET ?? "change_me";
const salt_rounds: number = Number(process.env.SALT_ROUNDS) ?? 10;

const mongo_host = process.env.MONGO_HOST || '127.0.0.1'
const mongo_port = process.env.MONGO_PORT || 27017
const mongo_db = process.env.MONGO_DB || 'conferences'

mongoose.connect(`mongodb://${mongo_host}:${mongo_port}/${mongo_db}`);

const asyncHandler = (fn: RequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err: any) => {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    });
  };
};


/*
* ----------------------------- SCHEMAS -----------------------------
*/
const EventSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    required: true
  },
  org: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    required: false
  },
  room_ids: {
    type: [],
    required: true
  },
  logo: {
    type: String,
    required: false
  },
  start_time: {
    type: Date,
    required: true
  },
  end_time: {
    type: Date,
    required: true
  },
  prep_time: {
    type: Date,
    required: true
  },
  resolved: {
    type: Boolean,
    required: false,
    default: false
  }
});
const Event = mongoose.model('Event', EventSchema);

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

const RoomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  sub_of: {
    type: [],
    required: false
  },
  sub_msg: {
    type: String,
    required: false
  },
  cur_status: {
    type: Number,
    required: true,
    default: 0
  },
  custom_message: {
    type: String,
    required: false
  }
})
const Room = mongoose.model('Room', RoomSchema);


/*
* ----------------------------- LOGIN -----------------------------
*/

const authJWT = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.split(' ')[1];
    if (token) {
      jwt.verify(token, jwt_secret, (err, user) => {
        if (err)
          return res.sendStatus(403);
        next();
      });
    } else {
      res.sendStatus(401);
    }
  } catch (_) {
    res.sendStatus(401);
  }
};

app.post('/api/register', asyncHandler(async (req: Request, res: Response) => {
  const { username, password }: { username: string, password: string } = req.body;
  const hashedPassword = await bcrypt.hash(password, salt_rounds);
  const newUser = new User({ username, password: hashedPassword });
  await newUser.save();
  res.status(201).json({ message: "User registered successfully" });
}));

app.post('/api/login', asyncHandler(async (req: Request, res: Response) => {
  const { username, password }: { username: string, password: string } = req.body;
  User.findOne({ username })
    .then(user => {
      // User is not registered
      if (!user) return res.status(400).json({ msg: "User does not exist" });

      // User is regisered, check password
      bcrypt.compare(password, user.password, (err, data) => {
        if (err) throw err;

        if (data) {
          const token = jwt.sign({ username }, jwt_secret, { expiresIn: '1h' });
          return res.status(200).json({ msg: 'Login success', token: token });
        }
      });
    })
}));

/*
* ----------------------------- ROOMS -----------------------------
*/
app.get("/api/rooms", asyncHandler(async (req: Request, res: Response) => {
  const rooms = await Room.find();
  res.json(rooms);
}));

/*
* ----------------------------- EVENTS -----------------------------
*/
// Logos schema
const LogoSchema = new mongoose.Schema({
  org: {
    type: String,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  data: {
    type: Buffer,
    required: true
  }
})
const Logo = mongoose.model('Logo', LogoSchema);

app.post('/api/logo/:org_id', authJWT, asyncHandler(async (req: Request, res: Response) => {
  const { org_id } = req.params;
  const files: UploadedFile | UploadedFile[] | undefined = req.files?.file;
  console.log(req.files);
  if (!files) {
    res.sendStatus(500);
    return;
  }
  const file: UploadedFile = Array.isArray(files) ? files[0] : files

  const newLogo = new Logo({
    org: org_id,
    mimetype: file.mimetype,
    data: file.data
  });
  newLogo.save();
  res.sendStatus(200);
}));

app.get('/api/logo/get/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const logo = await Logo.findById(id);
  if (!logo) {
    res.sendStatus(404);
    return;
  }
  res.set("Content-Type", logo.mimetype);
  res.write(logo.data, (err) => {
    if (err) throw err;
    res.end();
  });
  // res.writeHead(200, logo.data.toString(), { "Content-Type": logo.mimetype });
  // res.sendStatus(200);
}));

app.get('/api/logo/byorg/:org_id', asyncHandler(async (req: Request, res: Response) => {
  const { org_id } = req.params;
  const matches = await Logo.aggregate([
    {
      $match: {
        org: { $eq: org_id }
      }
    },
    {
      $project: {
        org: true
      }
    }
  ]);
  const ids = matches.map(match => (match._id));
  res.status(200).json(ids);
}));

app.delete('/api/logo/:id', authJWT, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const events = await Event.find({ logo: { $eq: id } });
  if (events.length > 0) {
    res.status(409).json('Questo logo e\' in uso da un altro evento, non cancellabile');
    return;
  }
  await Logo.findByIdAndDelete(id);
  res.sendStatus(200);
}));

/*
* ----------------------------- EVENTS -----------------------------
*/

const getEvents = async ({ start_time, end_time, limit, get_resolved, get_disabled }:
  { start_time?: string, end_time?: string, limit?: string, get_resolved?: boolean, get_disabled?: boolean }) => {
  const db_query: { resolved?: {}, start_time?: {}, end_time?: {} } = {};
  if (!get_resolved)
    db_query['resolved'] = { $eq: false };
  if (!get_disabled)
    db_query['enabled'] = { $eq: true };
  if (start_time)
    db_query['end_time'] = { ...db_query['end_time'], $gt: start_time };
  else
    db_query['end_time'] = { ...db_query['end_time'], $gt: new Date() };
  if (end_time)
    db_query['start_time'] = { ...db_query['start_time'], $lte: end_time };
  return Event.find(db_query, null, { limit: Number(limit) ?? 0, sort: 'start_time' });
};

app.get('/api/events', asyncHandler(async (req: Request, res: Response) => {
  const { start_time, end_time, limit, get_resolved = false, get_disabled = false }:
    { start_time?: string, end_time?: string, limit?: string, get_resolved?: boolean, get_disabled?: boolean } = req.query;
  const events = await getEvents({ start_time, end_time, limit, get_resolved, get_disabled });
  res.json(events);
}));

app.post('/api/events', authJWT, asyncHandler(async (req: Request, res: Response) => {
  const newEvent = new Event(req.body);
  await newEvent.save();
  checkOccupancies();
  res.sendStatus(200);
}));

app.post('/api/events/:id', authJWT, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  await Event.findByIdAndUpdate(id, req.body);
  checkOccupancies();
  res.sendStatus(200);
}));

app.delete('/api/events/:id', authJWT, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  await Event.findByIdAndDelete(id);
  checkOccupancies();
  res.sendStatus(200);
}));

app.get('/api/orgs', asyncHandler(async (_: any, res: Response) => {
  const e_orgs: string[] = await (Event.distinct('org'));
  const l_orgs: string[] = await (Logo.distinct('org'));
  const orgs = [...new Set([...l_orgs, ...e_orgs])];
  res.json(orgs);
}));

app.get('/api/logos/:org', asyncHandler(async (req: Request, res: Response) => {
  const { org } = req.params;
  const logos = await (Event.find({ org: org }).distinct('logo'));
  res.json(logos);
}))

/*
* ----------------------------- UTILS -----------------------------
*/

type RoomState = {
  cur_status: RoomOccupancy
  custom_message?: string
};

app.post('/api/rooms/:room_id', authJWT, asyncHandler(async (req: Request, res: Response) => {
  const { room_id } = req.params;
  const new_state: RoomState = req.body;
  const now = new Date();
  if (new_state.cur_status === RoomOccupancy.FREE) {
    await Event.updateMany({
      resolved: { $ne: true },
      enabled: { $eq: true },
      end_time: { $lt: now },
      room_ids: room_id
    }, {
      resolved: true
    });
  }
  await Room.updateOne({
    _id: { $eq: room_id }
  }, {
    cur_status: new_state.cur_status,
    custom_message: new_state.custom_message ?? null
  });
  checkOccupancies();
  res.sendStatus(200);

}));

const enum Stages {
  PREP,
  ENDED,
  STARTED,
};

const enum RoomOccupancy {
  FREE = 0,
  OCCUPIED = 1,
  WARN = 2,
};

const checkOccupancies = async () => {
  const now = new Date();
  const runningEvents: { _id: string, room_ids: string[], stage: number }[] = await Event.aggregate([
    {
      $match: {
        resolved: { $ne: true },
        enabled: { $eq: true },
        prep_time: { $lte: now }
      }
    },
    {
      $project: {
        room_ids: true,
        times: [
          { field: "$prep_time", stage: Stages.PREP },
          { field: "$start_time", stage: Stages.STARTED },
          { field: "$end_time", stage: Stages.ENDED },
        ],
      }
    },
    {
      $project: {
        room_ids: true,
        passedTimes: {
          $arrayElemAt: [
            {
              $filter: {
                input: "$times",
                as: "time",
                cond: { $lt: ["$$time.field", now] }
              },
            },
            -1
          ]
        }
      }
    },
    {
      $project: {
        room_ids: true,
        stage: "$passedTimes.stage"
      }
    },
    {
      $match: {
        stage: { $ne: null }
      }
    },
    {
      $sort: {
        stage: 1
      }
    }
  ]);
  if (runningEvents.length > 0) {
    for (const event of runningEvents) {
      const newStatus =
        event.stage === Stages.PREP ? RoomOccupancy.WARN : (
          event.stage === Stages.STARTED ? RoomOccupancy.OCCUPIED : (
            RoomOccupancy.WARN
          ));
      const subStatus =
        event.stage === Stages.STARTED ? RoomOccupancy.WARN : (
          event.stage === Stages.ENDED ? RoomOccupancy.FREE : (
            undefined
          ));
      await Room.updateMany({
        _id: { $in: event.room_ids }
      }, {
        cur_status: newStatus,
        custom_message: null
      });
      if (subStatus !== undefined) {
        await Room.updateMany({
          sub_of: { $in: event.room_ids }
        }, {
          cur_status: subStatus,
          custom_message: null
        })
      }
    }
  }
  broadcastWS(WSMessage.CHANGED_ROOMS);
  broadcastWS(WSMessage.CHANGED_EVENTS);
  resetTimeout();
  return;
}

const findNextEvent = async () => {
  const FORCE_TIMEOUT = 30;
  const now = new Date();
  const nextEvents = await Event.aggregate([
    {
      $match: {
        $and: [
          { resolved: { $eq: false } },
          { enabled: { $eq: true } },
          { end_time: { $lte: addMinutes(now, FORCE_TIMEOUT) } },
          { prep_time: { $lte: addMinutes(now, FORCE_TIMEOUT) } },
          { start_time: { $lte: addMinutes(now, FORCE_TIMEOUT) } }

        ]
      }
    },
    {
      $project: {
        filtered_times: {
          $filter: {
            input: [
              "$start_time",
              "$end_time",
              "$prep_time"
            ],
            as: "time",
            cond: { $gt: ["$$time", now] }
          }
        }
      }
    },
    {
      $project: {
        first_time: {
          $min: "$filtered_times"
        }
      }
    },
    {
      $group: {
        _id: null,
        earliestTime: { $min: "$first_time" }
      }
    }
  ]);
  if (nextEvents.length === 0) {
    return minutesToMilliseconds(FORCE_TIMEOUT);
  } else {
    const nextEventTime = nextEvents[0].earliestTime;
    if (!nextEventTime) return minutesToMilliseconds(FORCE_TIMEOUT);
    return differenceInMilliseconds(nextEventTime, now);
  }
};

const broadcastWS = (message: WSMessage) => {
  wsApp.getWss().clients.forEach((wsClient) => {
    wsClient.send(message)
  });
};

const nextRoomTimeout: NodeJS.Timeout | undefined = undefined;
const resetTimeout = async () => {
  clearTimeout(nextRoomTimeout);
  const next = await findNextEvent();
  console.log(`Next auto-wakeup in ${millisecondsToMinutes(next)} minutes.`);
  setTimeout(checkOccupancies, next);
};

resetTimeout();

setInterval(resetTimeout, hoursToMilliseconds(1));


const enum WSMessage {
  CHANGED_ROOMS = "0",
  CHANGED_EVENTS = "1"
};

wsApp.app.ws('/api/ws', (ws, _: Request) => {
  ws.on('message', (data, _) => {
    if (data.toString() === 'ping') {
      ws.send('pong');
    }
  });
});

app.listen(port, () => {
  console.log(`Server is on at http://localhost:${port}`);
});
