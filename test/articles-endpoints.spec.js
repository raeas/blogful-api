//const { expect } = require('chai')
const knex = require('knex')
const supertest = require('supertest')
const app = require('../src/app')
const { makeArticlesArray, makeMaliciousArticle } = require('./articles.fixtures')
const { makeUsersArray } = require('./users.fixtures')

describe('Articles Endpoints', function() {
  let db

  before('make knex instance', () => {
    db = knex({
      client: 'pg',
      connection: process.env.TEST_DB_URL,
    })
    app.set('db', db)
  })

  after('disconnect from db', () => db.destroy())

  before('clean the table', () => db.raw('TRUNCATE blogful_articles, blogful_users, blogful_comments RESTART IDENTITY CASCADE'))

  afterEach('cleanup', () => db.raw('TRUNCATE blogful_articles, blogful_users, blogful_comments RESTART IDENTITY CASCADE'))
//1 - DESCRIBE articles endpoint
  describe(`GET /api/articles`, () => {
//1A - CONTEXT to articles endpoint - given there are no articles in the database
    context(`Given no articles`, () => {
      it(`responds with 200 and an empty list`, () => {
        return supertest(app)
          .get('/api/articles')
          .expect(200, [])
        })
      })
//1A - CONTEXT to articles endpoint - given there are articles in the database
    context('Given there are articles in the database', () => {
      const testArticles = makeArticlesArray()
      const testUsers = makeUsersArray()

      beforeEach('insert articles', () => {
        return db
          .into('blogful_users')
          .insert(testUsers)
          .then(() => {
            return db
              .into('blogful_articles')
              .insert(testArticles)
          })
      })

      it('responds with 200 and all of the articles', () => {
        return supertest(app)
        .get('/api/articles')
        .expect(200, testArticles)
      })
    })
//1C - CONTEXT to article endpoint - Malicious Article
    context(`Given an XSS attack article`, () => {
      const { maliciousArticle, expectedArticle } = makeMaliciousArticle()
      const testUsers = makeUsersArray()

      beforeEach('insert malicious article', () => {
        return db
          .into('blogful_users')
          .insert(testUsers)
          .then(() => {
            return db
            .into('blogful_articles')
            .insert([ maliciousArticle ])
          })
      })

      it('removes XSS attach content', () => {
        return supertest(app)
          .get(`/api/articles`)
          .expect(200)
          .expect(res => {
            expect(res.body[0].title).to.eql(expectedArticle.title)
            expect(res.body[0].content).to.eql(expectedArticle.content) 
          })
      })
    })
  })
//2 DESCRIBE - articles by id    
  describe(`GET /api/articles/:article_id`, () => {
//2A CONTEXT - to articles by id - given no article id in db
    context(`Given no articles`, () => {
      it(`responds with 404`, () => {
        const articleId = 123456
        return supertest(app)
          .get(`/api/articles/${articleId}`)
          .expect(404, { error: { message: `Article doesn't exist` } })
       })
    })
//2B CONTEXT - to articles by id - given there are articles by id in db
    context('Given there are articles in the database', () => {
      const testArticles = makeArticlesArray()
      const testUsers = makeUsersArray()

    beforeEach('insert articles', () => {
      return db
        .into('blogful_users')
        .insert(testUsers)
        .then(() => {
          return db
            .into('blogful_articles')
            .insert(testArticles)
        })
    })

    it('responds with 200 and the specified article', () => {
      const articleId = 2
      const expectedArticle = testArticles[articleId - 1]
      return supertest(app)
        .get(`/api/articles/${articleId}`)
        .expect(200, expectedArticle)
      })
    })
//2C CONTEXT - to articles by id - given there are malicious articles in db
    context(`Given an XSS attack article`, () => {
      const { maliciousArticle, expectedArticle } = makeMaliciousArticle()
      const testUsers = makeUsersArray()

        beforeEach('insert malicious article', () => {
          return db
            .into('blogful_users')
            .insert(testUsers)
            .then(() => {
              return db
                .into('blogful_articles')
                .insert([ maliciousArticle ])
            })
        })
      
        it('removes XSS attack content', () => {
          return supertest(app)
            .get(`/api/articles/${maliciousArticle.id}`)
            .expect(200)
            .expect(res => {
              expect(res.body.title).to.eql(expectedArticle.title)
              expect(res.body.content).to.eql(expectedArticle.content)
            })
          })
        })
  })
//3 DESCRIBE - POST articles by id  
  describe(`POST /api/articles`, () => {
    const testUsers = makeUsersArray()

    beforeEach('insert malicious article', () => {
      return db
        .into('blogful_users')
        .insert(testUsers)
    })

    it(`creates an article, responding with 201 and the new article`,  function() {
      this.retries(3)
      const newArticle = {
        title: 'Test new article',
        style: 'Listicle',
        content: 'Test new article'
      }
    return supertest(app)
      .post('/api/articles')
      .send(newArticle)
      .expect(201)
      .expect(res => {
        expect(res.body.title).to.eql(newArticle.title)
        expect(res.body.style).to.eql(newArticle.style)
        expect(res.body.content).to.eql(newArticle.content)
        expect(res.body).to.have.property('id')
        expect(res.headers.location).to.eql(`/api/articles/${res.body.id}`)
        const expected = new Date().toLocaleDateString()
        const actual = new Date(res.body.date_published).toLocaleDateString()
        expect(actual).to.eql(expected)
      })
      .then(postRes =>
        supertest(app)
        .get(`/api/articles/${postRes.body.id}`)
        .expect(postRes.body)
      )
    })

    const requiredFields = ['title', 'style', 'content']

    requiredFields.forEach(field => {
    const newArticle = {
      title: 'Test new article',
      style: 'Listicle',
      content: 'Test new article content...'
    }

    it(`responds with 400 and an error message when the '${field}' is missing`, () => {
      delete newArticle[field]

      return supertest(app)
        .post('/api/articles')
        .send(newArticle)
        .expect(400, {
          error: { message: `Missing '${field}' in request body` }
        })
      })
    })

    it('removes XSS attack content from response', () => { 
      const { maliciousArticle, expectedArticle } = makeMaliciousArticle()
      return supertest(app)
      .post(`/api/articles`)
      .send(maliciousArticle)
      .expect(201)
      .expect(res => {
        expect(res.body.title).to.eql(expectedArticle.title)
        expect(res.body.content).to.eql(expectedArticle.content)
      })
    })
  })
//4 DESCRIBE - DELETE articles by id  
  describe(`DELETE /api/articles/:article_id`, () => {
//4A CONTEXT - given there are no article by id to delete
    context(`4A Given no articles`, () => {
      it(`responds with 404`, () => {
        const articleId = 123456
        return supertest(app)
          .delete(`/api/articles/${articleId}`)
          .expect(404, { error: { message: `Article doesn't exist` } })
      })
    })
//4B CONTEXT - given there are articles by id to delete
    context('Given there are articles in the database', () => {
      const testArticles = makeArticlesArray()
      const testUsers = makeUsersArray()

      beforeEach('insert articles', () => {
        return db
          .into('blogful_users')
          .insert(testUsers)
          .then(() => {
            return db
              .into('blogful_articles')
              .insert(testArticles)
          })
      })
    
      it('responds with 204 and removes the article', () => {
        const idToRemove = 2
        const expectedArticles = testArticles.filter(article => article.id !== idToRemove)
        return supertest(app)
          .delete(`/api/articles/${idToRemove}`)
          .expect(204)
          .then(res =>
            supertest(app)
              .get(`/api/articles`)
              .expect(expectedArticles)
          )
      })
    })
  })
//5 DESCRIBE - PATCH articles by id 
  describe(`5 PATCH /api/articles/:article_id`, () => {
//5A CONTEXT given there are no articles by id
    context(`5A Given no articles`, () => {
      it(`responds with 404`, () => {
        const articleId = 123456
        return supertest(app)
          .patch(`/api/articles/${articleId}`)
          .expect(404, { error: { message: `Article doesn't exist` } })
      })
    })
//5B CONTEXT given there are articles in the database
    context('Given there are articles in the database', () => {
      const testArticles = makeArticlesArray()
      const testUsers = makeUsersArray()
      
      beforeEach('insert articles', () => {
        return db
          .into('blogful_users')
          .insert(testUsers)
          .then (() => {
            return db
              .into('blogful_articles')
              .insert(testArticles)
          })
      })
      
      it('responds with 204 and updates the article', () => {
        const idToUpdate = 2
        const updateArticle = {
          title: 'updated article title',
          style: 'Interview',
          content: 'updated article content',
        }
        const expectedArticle = {
          ...testArticles[idToUpdate - 1],
          ...updateArticle
        }
        return supertest(app)
          .patch(`/api/articles/${idToUpdate}`)
          .send(updateArticle)
          .expect(204)
          .then(res =>
            supertest(app)
              .get(`/api/articles/${idToUpdate}`)
              .expect(expectedArticle)
            )
        })
      it(`responds with 400 when no required fields supplied`, () => {
        const idToUpdate = 2
        return supertest(app)
          .patch(`/api/articles/${idToUpdate}`)
          .send({ irrelevantField: 'foo' })
          .expect(400, {
            error: {
              message: `Request body must contain either 'title', 'style' or 'content'`
            }
          })
        })
      it(`responds with 204 when updating only a subset of fields`, () => {
        const idToUpdate = 2
        const updateArticle = {
          title: 'updated article title',
        }
        const expectedArticle = {
          ...testArticles[idToUpdate - 1],
          ...updateArticle
        }

        return supertest(app)
          .patch(`/api/articles/${idToUpdate}`)
          .send({
            ...updateArticle,
              fieldToIgnore: 'should not be in GET response'
          })
          .expect(204)
          .then(res =>
            supertest(app)
              .get(`/api/articles/${idToUpdate}`)
              .expect(expectedArticle)
          )
      })
    })
  })
})
