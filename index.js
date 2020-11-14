const PORT = process.env.PORT || 8080

const path = require('path').resolve()
const express = require('express')
const cookieParser = require('cookie-parser')
const knex = require('knex')
const sha256 = require('sha256')
const socketio = require('socket.io')
const randomString = require('crypto-random-string')
const { createServer } = require('http')
const { renderFile, render } = require('ejs')

const app = express()
const srv = createServer(app)
const ws = socketio(srv)
const db = knex({ client: 'mysql', connection: { host: 'localhost', port: 3306, user: 'studycrewmate', database: 'studycrewmate'  } })

app.use(cookieParser())
app.use('/src', express.static(path + '/src'))
app.get('/login', (_, res) => res.sendFile(path + '/page/login.html'))
app.get('/regist', (_, res) => res.sendFile(path + '/page/regist.html'))

app.use('/api/login', express.urlencoded({ extended: false }))
app.post('/api/login', async (req, res) => {
  if (!req.query.type) return
  switch (req.query.type) {
    case 'legacy': {
      const { id, passwd } = req.body
      if (!id || !passwd) return res.send('<script>alert("입력되지 않은 필드가 있습니다\\n확인후 다시 로그인 해주세요")')
      const [data] = await db.select('*').where('id', id).from('users')
      if (!data) return res.send('<script>alert("유저를 찾을 수 없습니다\\n확인후 다시 로그인 해주세요"); window.location.replace("/login")</script>')
      if (sha256(data.salt + passwd) !== data.passwd) return res.send('<script>alert("비밀번호가 맞지 않습니다\\n확인후 다시 로그인 해주세요"); window.location.replace("/login")</script>')

      const sessionid = randomString({ length: 30 })
      await db.insert({ sessionid, userid: data.id }).into('sessions')
      res.cookie('session', sessionid).redirect('/')
      break
    }
  }
})

app.use('/api/regist', express.urlencoded({ extended: false }))
app.post('/api/regist', async (req, res) => {
  const { id, username, passwd: rawpw, passwdcheck, score } = req.body
  if (!id || !username || !rawpw || !score) return res.send('<script>alert("입력되지 않은 필드가 있습니다\\n확인 후 다시 시도해 주세요."); window.location.replace("/regist")')
  
  if (rawpw !== passwdcheck) return res.send('<script>alert("비밀번호와 일치하지 않습니다.\\n확인 후 시도해 주세요."); window.location.replace("/regist")')
  if (id.length > 30 || username.length > 30) return res.send('<script>alert("아이디와 닉네임은 30자를 넘을 수 없습니다!\\n다른 아이디, 닉네임을 선택해 주세요."); window.location.replace("/regist")</script>')
  if (rawpw.length < 5 ) return res.send('<script>alert("비밀번호는 5자 이하로 작성하실 수 없습니다."); window.location.replace("/regist")</script>')

  const [data] = await db.select('*').where('id', id).from('users')
  if (data) return res.send('<script>alert("중복된 아이디를 가진 유저를 발견했습니다!\\n다른 아이디를 선택해 주세요."); window.location.replace("/regist")</script>')

  const salt = createSalt()
  const passwd = sha256(salt + rawpw)

  await db.insert({ id, username, passwd, salt, score }).into('users')
  
  const sessionid = randomString({ length: 30 })
  await db.insert({ sessionid, userid: id }).into('sessions')
  res.cookie('session', sessionid).redirect('/')
})

app.use(async (req, res, next) => {
  if (!req.cookies.session) return res.redirect('/login')
  
  const [data] = await db.select('*').where('sessionid', req.cookies.session).from('sessions')
  if (!data) return res.cookie('session', '').redirect('/login')

  next()
})

app.get('/', async (req, res) => {
  const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
  const [user] = await db.select('*').where('id', session.userid).from('users')
  const todos = await db.select('*').where('userid', session.userid).andWhere('done', 0).orderBy('createdAt', 'desc').from('todo')
  const str = await renderFile(path + '/page/index.ejs', { point: user.point, todos })
  res.send(str)
})

app.get('/crew', async (req, res) => {
  const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
  const [user] = await db.select('*').where('id', session.userid).from('users')
  const users = await db.select('*').where('crewid', user.crewid || '').from('users').orderBy('point', 'desc')
  const crews = await db.select('*').from('crews')
  const str = await renderFile(path + '/page/crew.ejs', { users, user, crews })
  res.send(str)
})

app.get('/list', async (req,res) => {
  const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
  const [user] = await db.select('*').where('id', session.userid).from('users')
  const users = await db.select('*').from('users').orderBy('point', 'desc')
  const str = await renderFile(path + '/page/list.ejs', {users, user})
  res.send(str)
})

app.get('/match', async (req, res) => {
  const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
  const [user] = await db.select('*').where('id', session.userid).from('users')
  if (user.point < 25) return res.send('<script>alert("메이트 메칭에 필요한 포인트가 부족합니다"); window.location.replace("/") </script>')
  await db.update({ point: user.point - 25 }).where('id', user.id).from('users')
  res.sendFile(path + '/page/matching.html')
})

app.get('/matchcrew', async (req, res) => {
  const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
  const [user] = await db.select('*').where('id', session.userid).from('users')
  if (!user.crewid) return res.send('<script>alert("소속된 크루가 없습니다!\\n크루 등록 창으로 보내드릴깨요"); window.location.replace("/crew") </script>')
  res.sendFile(path + '/page/matchcrew.html')
})

app.get('/todo', async (req, res) => {
  const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
  // const [user] = await db.select('*').where('id', session.userid).from('users')
  const todos = await db.select('*').where('userid', session.userid).andWhere('done', 0).orderBy('createdAt', 'desc').from('todo')
  const str = await renderFile(path + '/page/todo.ejs', { todos })
  res.send(str)
})

app.get('/api/point', async (req,res) => {
  if (!req.query.type) return res.sendStatus(400)
  const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
  const [user] = await db.select('*').where('id', session.userid).from('users')
  switch (req.query.type) {
    case 'query': {
      res.send({ point : user.point})
      break;
    }
    
    case 'set' : {
      if (!req.query.point) return res.sendStatus(400)
      await db.update({point: req.query.point}).where('id', session.userid).from('users')
      res.sendStatus(200)
      break
    }
    
    default:
      res.sendStatus(404)
      break;
  }
})

app.use('/api/todo', express.urlencoded({ extended: false }))
app.use('/api/todo', async (req, res) => {
  switch (req.query.type) {
    case 'create': {
      const { name, description } = req.body
      if(!name || !description) return res.send('<script>alert("입력되지 않은 필드가 존재합니다\\n확인 후 다시 시도해 주세요."); window.location.replace("/todo") </script>')
      
      const todoid = randomString({ length: 30 })
      const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
      await db.insert({ todoid, userid:session.userid, name, description }).into('todo')
      res.send('<script>alert("목표를 추가되었습니다!"); window.location.replace("/todo")</script>')
      break
    }
    
    case 'edit': {
      const { name, description, id } = req.body
      if(!name || !description) return res.send('<script>alert("입력되지 않은 필드가 존재합니다\\n확인 후 다시 시도해 주세요."); window.location.replace("/todo") </script>')
      
      const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
      const [todo] = await db.select('*').where('todoid', id).from('todo')

      if(todo.userid !== session.userid) return res.send('<script>alert("해당 목표를 수정 수 있는 권한이 부족합니다!"); window.location.replace("/todo")</script>')
      await db.update({ name: name, description }).where('todoid', todo.id).from('todo')
      res.send('<script>alert("해당 목표을 수정했습니다!"); window.location.replace("/todo")</script>')
      break
    }
  
    case 'remove': {
      const {id} = req.query
      const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
      const [todo] = await db.select('*').where('todoid', id).from('todo')

      if(todo.userid !== session.userid) return res.send('<script>alert("해당 목표를 삭제할 수 있는 권한이 부족합니다!"); window.location.replace("/todo")</script>')
      await db.delete().where('todoid', id).from('todo')
      res.send('<script>alert("해당 목표을 취소했습니다!"); window.location.replace("/todo")</script>')
      break
    }

    case 'done': {
      const { id } = req.query
      
      const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
      const [todo] = await db.select('*').where('todoid', id).from('todo')

      if(todo.userid !== session.userid) return res.send('<script>alert("해당 목표를 수정 수 있는 권한이 부족합니다!"); window.location.replace("/todo")</script>')
      await db.update({ done: 1 }).where('todoid', id).from('todo')
      await db.increment('point', 4).where('id', session.userid).from('users')
      res.send('<script>alert("목표를 완료 처리하였습니다!\\n+4 포인트 획득!"); window.location.replace("/todo")</script>')
      break
    }
    default:
      break;
  }
})

app.use('/api/crew', express.urlencoded({ extended: false }))
app.use('/api/crew', async (req, res) => {
  switch (req.query.type) {
    case 'create': {
      const { name, description } = req.body
      if (!name) return res.send('<script>alert("크루 이름이 입력되지 않았습니다\\n확인 후 다시 시도해 주세요."); window.location.replace("/crew") </script>')
      const [exists] = await db.select('*').where('name', name).from('crews');
      if (exists) return res.send('<script>alert("동일한 이름의 크루가 있습니다\\n확인 후 다시 시도해 주세요."); window.location.replace("/crew") </script>')

      const crewid = randomString({ length: 30 })
      const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
      await db.insert({ crewid, name, description: description || '(크루 설명 없음)', adminid: session.userid }).into('crews')
      await db.update({ crewid }).where('id', session.userid).from('users')
      res.send('<script>alert("크루가 생성되었습니다"); window.location.replace("/crew")</script>')
      break
    }
    case 'remove': { // 크루 이름 프라이머리임 
      const { crewname } = req.query
      if (!crewname) return res.send('<script>alert("크루 이름이 입력되지 않았습니다!\\n확인 후 다시 시도해 주세요."); window.location.replace("/crew") </script>')
      const [crew] = await db.select('*').where('crewid', crewname).from('crews')
      if (!crew) return res.send('<script>alert("해당 크루는 존재하지 않습니다!\\n확인 후 다시 시도해 주세요."); window.location.replace("/crew") </script>')
      const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
      if (crew.adminid !== session.userid) return res.send('<script>alert("크루를 생성한 사람만 크루를 삭제할 수 있습니다"); window.location.replace("/crew") </script>')
      await db.update({ crewid: null }).where('id', session.userid).from('users')
      await db.delete().where('crewid', crew.crewid).from('crews')
      res.redirect('/crew')
      break
    }
    case 'join' : {
      const { crewname } = req.query
      if (!crewname) return res.send('<script>alert("크루 이름이 입력되지 않았습니다!\\n확인 후 다시 시도해 주세요."); window.location.replace("/crew") </script>')
      const [crew] = await db.select('*').where('crewid', crewname).from('crews')
      if (!crew) return res.send('<script>alert("해당 크루는 존재하지 않습니다!\\n확인 후 다시 시도해 주세요."); window.location.replace("/crew") </script>')
      const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')


      await db.update({ crewid: crew.crewid }).where('id', session.userid).from('users')
      res.redirect('/crew')
      break
    }

    case 'leave' : {
      const { crewname } = req.query
      if (!crewname) return res.send('<script>alert("크루 이름이 입력되지 않았습니다!\\n확인 후 다시 시도해 주세요."); window.location.replace("/crew") </script>')
      const [crewid] = await db.select('*').where('crewid', crewname).from('crews')
      if (!crewid) return res.send('<script>alert("해당 크루는 존재하지 않습니다!\\n확인 후 다시 시도해 주세요."); window.location.replace("/crew") </script>')
      const [session] = await db.select('userid').where('sessionid', req.cookies.session).from('sessions')
      
      await db.update({ crewid: null }).where('id', session.userid).from('users')
      res.redirect('/crew')
      break
    }

    case 'find': {
      const { crewname } = req.query
      if (!crewname) return res.send('<script>alert("크루 이름이 입력되지 않았습니다!\\n확인 후 다시 시도해 주세요."); window.location.replace("/crew") </script>')
      const [crew] = await db.select('*').where('crewid', crewname).from('crews')
      if (!crew) return res.send('<script>alert("해당 크루는 존재하지 않습니다!\\n확인 후 다시 시도해 주세요."); window.location.replace("/crew") </script>')
      res.send('<script>alert("크루를 찾았습니다\\n이름: ' + crew.name + '\\n설명' + crew.desc + '"); window.location.replace("/crew") </script>')
      break
    }
  }
})

// ---

ws.on('connection', (socket) => {
  socket.on('match', async (sessionid) => {
    const rooms = await db.select('*').where('available', '<', 2).from('rooms')
    if (rooms.length < 1) {
      const roomid = randomString({ length: 30 })
      await db.insert({ roomid, sessionid }).into('rooms')
      socket.emit('match', roomid)
    } else socket.emit('match', rooms[Math.floor(Math.random() * rooms.length)])
  })

  socket.on('matchcrew', async (sessionid) => {
    const rooms = await db.select('*').where('available', '<', 6).from('crewrooms')
    if (rooms.length < 1) {
      const roomid = randomString({ length: 30 })
      await db.insert({ roomid, sessionid }).into('crewrooms')
      socket.emit('matchcrew', roomid)
    } else socket.emit('matchcrew', rooms[Math.floor(Math.random() * rooms.length)])
  })

  socket.on('roomvid', async (roomid, session, vid) => {
    const [sessiond] = await db.select('userid').where('sessionid', session).from('sessions')
    const [user] = await db.select('username').where('id', sessiond.userid).from('users')
    ws.emit('room:' + roomid, session, user.username, vid)
  })
  socket.on('chat', async (roomid, author, msg) => {
    const [session] = await db.select('userid').where('sessionid', author).from('sessions')
    const [user] = await db.select('username').where('id', session.userid).from('users')
    ws.emit('chat:' + roomid, user.username, msg) // 어케 크루 만들게 할꺼임 api?
  })
})

app.get('/room/:roomid', async (req, res) => {
  const { roomid } = req.params
  const [data] = await db.select('*').where({ roomid }).where('available', '<', 2).from('rooms')
  if (!data) return res.redirect('/match')
  
  await db.increment('available').where({ roomid }).from('rooms')
  const [session] = await db.select('*').where('sessionid', req.cookies.session).from('sessions')
  const [user] = await db.select('*').where('id', session.userid).from('users')
  const str = await renderFile(path + '/page/room.ejs', { roomid, user })

  res.send(str)
})

app.get('/crewroom/:roomid', async (req, res) => {
  const { roomid } = req.params
  const [data] = await db.select('*').where({ roomid }).where('available', '<', 6).from('crewrooms')
  if (!data) return res.redirect('/matchcrew')
  
  await db.increment('available').where({ roomid }).from('crewrooms')
  const [session] = await db.select('*').where('sessionid', req.cookies.session).from('sessions')
  const [user] = await db.select('*').where('id', session.userid).from('users')
  const str = await renderFile(path + '/page/crewroom.ejs', { roomid, user })

  res.send(str)
})

// ---

srv.listen(PORT, async () => {
  await db.delete().from('rooms')
  console.log('Server is now on http://localhost:' + PORT)
})

function createSalt () {
  let salt = ''
  for (let i = 0; i < 10; i++) {
    salt += i % 2 < 1
      ? String.fromCharCode(Math.floor(Math.random() * 106 - 8) + 21 + i)
      : String.fromCharCode(Math.floor(Math.random() * 169 - 8) + 697 + i)
  }
  return salt
}
