/**
 * Copyright (c) Mesto.co
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import express from 'express';
import { Permission } from '../enums/permission';
import knex from '../knex';
import { getArgs, hasPermission } from '../utils';

enum EventStatus {
  CREATED = 'created',
  DELETED = 'deleted',
}

const getEvent = express.Router();
getEvent.route('/').get(async (request, response) => {
  try {
    const {id} = getArgs(request);
    const currentUser = request.user!.id;
    const {rows: rowsJoin} = await knex.raw('SELECT 1 FROM event_user WHERE event_id = :id AND user_id = :currentUser', { id, currentUser });
    const joined = rowsJoin.length > 0;

    const joinClause = ' INNER JOIN "User" creator_user ON creator_user.id = e.creator';

    const {rows: [eventRow]} = await knex.raw(`SELECT e.creator, e.time, e.time_end, e.category, e.title, e.description, e.image, e.link, e.place_id, e.location, creator_user."imagePath", creator_user."fullName" FROM event e ${joinClause} WHERE e.id = :id AND e.status = :status`, { id, status: EventStatus.CREATED });
    if (!eventRow)
      return response.status(404).json({}).end();
    let result = {
      creator: eventRow.creator,
      time: eventRow.time,
      timeEnd: eventRow.time_end,
      category: eventRow.category,
      title: eventRow.title,
      description: eventRow.description,
      placeId: eventRow.place_id,
      location: eventRow.location,
      creatorName: eventRow.fullName,
      creatorImage: eventRow.imagePath
    };
    if (eventRow.image)
      result = Object.assign(result, {image: eventRow.image});
    if (joined || eventRow.creator === currentUser)
      result = Object.assign(result, {link: eventRow.link});

    return response.status(200).json(result).end();
  } catch (e) {
    console.debug('POST event/get error', e);
    response.status(500).json({}).end();
  }
});

const getJoinedUsers = express.Router();
getJoinedUsers.route('/').get(async (request, response) => {
  try {
    const {id} = getArgs(request);

    const {rows}: {rows: [{id: string, fullName: string, imagePath: (string|null)}]} = await knex.raw(`select "User".id, "User"."fullName", "User"."imagePath" from "User" inner join event_user on "User".id = event_user.user_id where event_user.event_id = :id`, { id });
    const joinedUsers = [];
    for (const row of rows) {
      joinedUsers.push(Object.assign({
        id: row.id,
        fullName: row.fullName
      }, row.imagePath ? {imagePath: row.imagePath} : {}));
    }

    const result = {
      joined: joinedUsers
    };

    return response.status(200).json(result).end();
  } catch (e) {
    console.debug('POST event/get joined error', e);
    response.status(500).json({}).end();
  }
});

const addEvent = express.Router();
addEvent.route('/').post(async (request, response) => {
  try {
    if (!hasPermission(request, Permission.EVENT))
      return response.status(401).json({}).end();
    const creator = request.user!.id;
    const {time, title, description, image, link, category, timeEnd, placeId, location} = getArgs(request);
    const {rows: [{id}]} = await knex.raw('INSERT INTO event(creator, time, time_end, category, title, description, image, link, place_id, status, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id', [
      creator,
      time,
      timeEnd,
      category,
      title,
      description,
      image || null,
      link || null,
      placeId || null,
      EventStatus.CREATED,
      location || null
    ]);
    return response.status(200).json({id}).end();
  } catch (e) {
    switch (e.code) {
      case '22007':
        // invalid_datetime_format
        return response.status(400).json({message: 'Invalid time format'}).end();
      case '23514':
        // check_violation
        return response.status(400).json({message: 'Invalid creator'}).end();
    }
    console.debug('POST event/add error', e);
    return response.status(500).json({}).end();
  }
});

const editEvent = express.Router();
editEvent.route('/').post(async (request, response) => {
  try {
    if (!hasPermission(request, Permission.EVENT))
      return response.status(401).json({}).end();
    const currentUser = request.user!.id;
    const {id, title, time, description, image, link, timeEnd, category, placeId, location} = getArgs(request);
    const {rowCount} = await knex.raw('UPDATE event SET title = :title, description = :description, image = :image, link = :link, time = :time, time_end = :timeEnd, category = :category, place_id = :placeId, location = :location WHERE id = :id AND creator = :currentUser AND status = :status', {
      title,
      description,
      image: image || null,
      time,
      timeEnd,
      category,
      placeId: placeId || null,
      location: location || null,
      link: link || null,
      id,
      currentUser,
      status: EventStatus.CREATED,
    });
    if (rowCount < 1)
      return response.status(404).json({}).end();
    return response.status(200).json({}).end();
  } catch (e) {
    // invalid_datetime_format
    if (e.code === '22007')
      return response.status(400).json({message: 'Invalid time format'}).end();
    if (e.code === '23514')
      return response.status(400).json({message: 'Invalid creator'}).end();
    console.debug('POST event/edit', e);
    return response.status(500).json({}).end();
  }
});

const delEvent = express.Router();
delEvent.route('/').post(async (request, response) => {
  try {
    const {id} = getArgs(request);
    if (!hasPermission(request, Permission.DELEVENT)) {
      const currentUser = request.user!.id;
      const {rows} = await knex.raw('SELECT 1 FROM event WHERE id = :id AND creator = :currentUser', {id, currentUser});
      if (rows.length === 0)
        return response.status(401).json({}).end();
    }
    await knex.raw('UPDATE event SET status = :status WHERE id = :id', { id, status: EventStatus.DELETED });
    return response.status(200).json({}).end();
  } catch (e) {
    console.debug('POST event/del', e);
    response.status(500).json({}).end();
  }
});

const joinEvent = express.Router();
joinEvent.route('/').post(async (request, response) => {
  try {
    const {id} = getArgs(request);
    const currentUser = request.user!.id;
    await knex.raw('INSERT INTO event_user(user_id, event_id) VALUES (:userId, :id)', {
      userId: currentUser,
      id
    });
    return response.status(200).json({}).end();
  } catch (e) {
    switch (e.code) {
      case '23505':
        // UNIQUE VIOLATION
        return response.status(409).json({message: 'The user is already registered for the event '}).end();
      case '23503':
        // FOREIGN KEY VIOLATION
        return response.status(404).json({message: 'User or event was not found'}).end();
    }
    console.debug('POST event/join', e);
    return response.status(500).json({}).end();
  }
});

const unjoinEvent = express.Router();
unjoinEvent.route('/').post(async (request, response) => {
  try {
    const {id} = getArgs(request);
    await knex.raw('DELETE FROM event_user WHERE user_id = :userId AND event_id = :id', {
      userId: request.user!.id,
      id
    });
    return response.status(200).json({}).end();
  } catch (e) {
    console.debug('POST event/unjoin', e);
    return response.status(500).json({}).end();
  }
});

const searchEvents = express.Router();
searchEvents.route('/').post(async (request, response) => {
  try {
    const {createdByMe, joinedByMe, from, to, offset, count, category, countJoined, q, placeId} = getArgs(request);
    let whereClause = ' WHERE e.time >= :from AND e.time <= :to AND e.status = :status';
    let joinClause = '';
    if (createdByMe)
      whereClause += ' AND creator = :user';
    if (joinedByMe)
      joinClause += ' INNER JOIN event_user eu ON eu.user_id = :user AND eu.event_id = e.id';
    else
      joinClause += ' LEFT JOIN event_user eu ON eu.user_id = :user AND eu.event_id = e.id';

    joinClause += ' INNER JOIN "User" creator_user ON creator_user.id = e.creator';

    if (category)
      whereClause += ' AND e.category = :category';
    if (q)
      whereClause += ` AND e.title LIKE :query`;
    if (placeId)
      whereClause += ' AND e.place_id = :placeId';
    const userId = request.user!.id;
    const {rows} = await knex.raw(`SELECT e.id, e.creator, e.time, e.time_end, e.category, e.title, e.description, e.image, e.link, e.place_id, e.location, eu.user_id, count(*) OVER() AS total, eu.event_id is not null as is_joined, creator_user."imagePath", creator_user."fullName" FROM event e ${joinClause}${whereClause} ORDER BY time ASC LIMIT :count OFFSET :offset`, {
      from, to, offset, count, user: userId, status: EventStatus.CREATED, category, placeId, query: '%' + q + '%'
    });
    const result = rows.map((row: { id: string; creator: string; time: string; time_end: string; category: string; title: string; description: string; image: string; user_id: string|undefined; link: string; place_id: string, location: string, is_joined: string, imagePath: string, fullName: string }) => {
      let event = {
        id: row.id,
        creator: row.creator,
        category: row.category,
        time: row.time,
        timeEnd: row.time_end,
        title: row.title,
        description: row.description,
        placeId: row.place_id,
        location: row.location,
        isJoined: row.is_joined,
        creatorName: row.fullName,
        creatorImage: row.imagePath,
        joined: []
      };
      if (row.image)
        event = Object.assign(event, { image: row.image });
      if (row.creator === userId || row.user_id)
        event = Object.assign(event, { link: row.link });
      return event;
    });
    if (countJoined > 0 && result.length > 0) {
      const eventIds = result.map((event: { id: string}) => event.id);
      // By limiting results by eventIds * countJoined we will get at least countJoined users for each event, so we need to filter some users after.
      const {rows}: {rows: [{id: string, fullName: string, imagePath: (string|null), event_id: string}]} = await knex.raw(`SELECT u.id, u."fullName", u."imagePath", eu.event_id FROM "User" u INNER JOIN event_user eu ON u.id = eu.user_id WHERE eu.event_id IN (${Array(eventIds.length).fill('?').join(',')}) LIMIT ?`, [...eventIds, eventIds.length * countJoined]);
      const usersPerEvent = new Map();
      for (const row of rows) {
        const users = usersPerEvent.get(row.event_id) || [];
        users.push(Object.assign({
          id: row.id,
          fullName: row.fullName
        }, row.imagePath ? {imagePath: row.imagePath} : {}));
        usersPerEvent.set(row.event_id, users);
      }
      for (const event of result)
        event.joined = (usersPerEvent.get(event.id) || []).slice(0, countJoined);
    }
    const total = rows.length > 0 ? rows[0].total * 1 : 0;
    return response.status(200).json({ data: result, total: total }).end();
  } catch (e) {
    if (e.code === '22007')
      return response.status(400).json({message: 'Invalid time format'}).end();
    console.debug('POST event/search', e);
    return response.status(500).json({}).end();
  }
});

export { getEvent, getJoinedUsers, addEvent, delEvent, editEvent, joinEvent, unjoinEvent, searchEvents };
