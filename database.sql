create user studycrewmate@localhost;
create schema studycrewmate;
grant all privileges on studycrewmate.* to studycrewmate@localhost;
use studycrewmate;

create table users (
  id varchar(30) not null primary key,                   -- 유저 아이디 (수정불가)
  username varchar(30) not null,                         -- 유저 닉네임 (수정가능)
  passwd varchar(64) not null,                           -- 유저 비번
  salt varchar(10) not null,                             -- 비번 솔트값
  point int default 100 not null,                        -- 학습 포인트
  score int default 3 not null,                          -- 매칭용 숙련도 점수
  crewid varchar(30),                                    -- 가입한 크루 ID
  createdAt timestamp default current_timestamp not null -- 유저 생성일
);

create table sessions (
  sessionid varchar(30) not null primary key,            -- 세션 ID (1회성 X)
  userid varchar(30) not null,                           -- 유저 아이디 (닉네임 아님)
  createdAt timestamp default current_timestamp not null -- 세션 생성일
);

create table rooms ( -- 1:1 룸
  roomid varchar(30) not null primary key, -- 룸 ID
  sessionid varchar(30) not null,          -- 방주인 세션
  available int(1) default 0 not null,     -- 룸 들어온 사람 수
  camshare int(1) default 0 not null       -- 카메라 공유
);

create table crewrooms ( -- 1:1 룸
  roomid varchar(30) not null primary key, -- 룸 ID
  sessionid varchar(30) not null,          -- 방주인 세션
  available int(1) default 0 not null,     -- 룸 들어온 사람 수
  camshare int(1) default 0 not null       -- 카메라 공유
);

create table crews (
  crewid varchar(30) not null primary key,                -- 크루 ID
  name varchar(100) not null,
  description text,
  adminid varchar(30) not null,               -- 크루 어드민 ID
  createdAt timestamp default current_timestamp not null  -- 크루 생성일
);

create table todo (
  todoid varchar(30) not null primary key,
  userid varchar(30),
  name varchar(100) not null,
  description text,
  done boolean default 0 not null,
  createdAt timestamp default current_timestamp not null -- 목표 생성일
);

-- create table studies (
--   userid varchar(30) not null,                            -- 유저 아이디
--   length int default 0 not null,                          -- 학습 길이
--   subject int not null,                                   -- 과목코드
--   createdAt timestamp default current_timestamp not null, -- 유저 생성일
-- );
