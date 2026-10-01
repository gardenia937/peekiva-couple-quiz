"""Peekiva Couple Quiz — end-to-end API test (35 checks, self-cleaning).

Runs against the LIVE production API. It creates its own quiz, answers it,
checks every privacy rule, then deletes everything it made.
Needs: curl + python3. No secrets, no login.

Run:  python3 tests/e2e_api.py
"""
import subprocess, json, time, sys
W='https://couple-quiz-api.gardenia937.workers.dev'
ORIGIN='https://couple-quiz-ajh.pages.dev'
passed=[]; failed=[]
def api(method, path, body=None, origin=ORIGIN):
    cmd=['curl','-s','-m','40','-X',method,W+path,'-H','Content-Type: application/json']
    if origin: cmd+=['-H','Origin: '+origin]
    if body is not None: cmd+=['-d',json.dumps(body)]
    last=None
    for i in range(5):
        p=subprocess.run(cmd,capture_output=True,text=True)
        try:
            d=json.loads(p.stdout or '{}')
            if d.get('success'): return d
            last=d; time.sleep(3)  # retry soft failures (transient edge)
        except Exception as e:
            last={'parse':str(e),'out':p.stdout[:100]}; time.sleep(3)
    return last
def need(d, what):
    assert d.get('success'), f'{what} FAILED: {json.dumps(d)[:200]}'
    return d['data']
def check(name, cond, extra=''):
    (passed if cond else failed).append(name)
    print(('PASS ' if cond else 'FAIL ')+name, extra)
body = {'title':'How Well Do You Know Me?','description':'Answer honestly.','questions':[
 {'text':'Perfect weekend?','type':'choice','options':['Sleep in','Road trip','Brunch']},
 {'text':'Pet peeve?','type':'choice','options':['Late','Mess','Noise','Small talk']},
 {'text':'Phone first thing?','type':'yesno','options':[]},
 {'text':'One thing I need to hear?','type':'short','options':[]}]}
d = need(api('POST','/api/quizzes',body),'create')
qid=d['quizId']; tok=d['creatorToken']
check('create-quiz', True, qid)
check('quizid-format', len(qid)==7)
check('token-entropy', len(tok)==32)
d=need(api('GET',f'/api/quiz/{qid}'),'public-read')
raw=json.dumps(d)
check('public-read', len(d['quiz']['questions'])==4)
check('no-token-leak', 'creator_token' not in raw and 'creatorToken' not in raw)
check('no-responses-leak', 'responder_name' not in raw and 'time_spent' not in raw)
check('quiz-404', api('GET','/api/quiz/ZZZZZZZ').get('code')=='QUIZ_NOT_FOUND')
d=need(api('POST',f'/api/quiz/{qid}/responses',{'responderName':'Alex'}),'response')
rid=d['responseId']
check('create-response', True)
check('empty-title-rejected', not api('POST','/api/quizzes',{'title':'','description':'','questions':[]}).get('success'))
qs=need(api('GET',f'/api/quiz/{qid}'),'qs')['quiz']['questions']
t0=int(time.time()*1000)
payload={'answers':[
 {'questionId':qs[0]['id'],'answerText':'Road trip','startedAt':t0-7400,'answeredAt':t0},
 {'questionId':qs[1]['id'],'answerText':'Mess','startedAt':t0-3100,'answeredAt':t0},
 {'questionId':qs[2]['id'],'answerText':'Yes','startedAt':t0-2100,'answeredAt':t0},
 {'questionId':qs[3]['id'],'answerText':'You are doing great.','startedAt':t0-21800,'answeredAt':t0}]}
d=need(api('POST',f'/api/responses/{rid}/answers',payload),'save')
check('save-answers', d['saved']==4)
check('bogus-option-rejected', not api('POST',f'/api/responses/{rid}/answers',{'answers':[{'questionId':qs[0]['id'],'answerText':'HACKED','startedAt':t0-100,'answeredAt':t0}]}).get('success'))
d=need(api('GET',f'/api/responses/{rid}/state'),'state')
check('resume-state', len(d['answers'])==4)
time.sleep(2)
d=need(api('POST',f'/api/responses/{rid}/complete',{}),'complete')
check('complete', d['totalTimeMs']>=2000, str(d['totalTimeMs']))
d=need(api('GET',f'/api/manage/{tok}'),'dashboard')
check('dashboard', len(d['responses'])==1 and d['responses'][0]['responderName']=='Alex')
check('bad-token-404', api('GET','/api/manage/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA').get('code')=='DASHBOARD_INVALID')
check('quizid-is-not-token', api('GET',f'/api/manage/{qid}').get('code')=='DASHBOARD_INVALID')
d=need(api('GET',f'/api/manage/{tok}/responses/{rid}'),'full')
check('manage-response', d['stats']['answeredCount']==4)
spent={a['questionText']:a['timeSpentMs'] for a in d['answers']}
check('timing-q1', abs(spent.get('Perfect weekend?',-1)-7400)<50, str(spent))
check('timing-short', abs(spent.get('One thing I need to hear?',-1)-21800)<50)
check('slowest-three', len(d['stats']['slowestThree'])==3 and d['stats']['slowestThree'][0]['timeSpentMs']==21800)
check('avg', d['stats']['avgTimeMs']==round((7400+3100+2100+21800)/4), str(d['stats']['avgTimeMs']))
d=need(api('POST',f'/api/manage/{tok}/share',{'responseId':rid}),'share')
check('share', True); sid=d['shareId']
d=need(api('GET',f'/api/shared/{sid}'),'preview')
raw2=json.dumps(d); sh=d['share']
check('shared-preview', sh.get('responderName')=='Alex' and sh.get('quizTitle')=='How Well Do You Know Me?')
check('shared-no-answers', 'Road trip' not in raw2 and 'doing great' not in raw2)
d=need(api('POST',f'/api/quiz/{qid}/responses',{'responderName':'Jamie'}),'resp2')
check('second-response', True)
d=need(api('GET',f'/api/manage/{tok}'),'dash2')
check('multi-response-count', d['quiz']['responseCount']==1, str(d['quiz'])[:150])
check('close', api('POST',f'/api/manage/{tok}/close',{}).get('success'))
check('closed-410', api('GET',f'/api/quiz/{qid}').get('code')=='QUIZ_CLOSED')
check('reopen', api('POST',f'/api/manage/{tok}/reopen',{}).get('success'))
check('reopened-readable', api('GET',f'/api/quiz/{qid}').get('success'))
p=subprocess.run(['curl','-s','-m','30','-D','-','-o','/dev/null','-H','Origin: https://evil.example.com',W+f'/api/quiz/{qid}'],capture_output=True,text=True)
check('cors-evil-no-acao', 'access-control-allow-origin' not in p.stdout.lower())
check('delete', api('DELETE',f'/api/manage/{tok}').get('success'))
check('deleted-quiz-gone', api('GET',f'/api/quiz/{qid}').get('code')=='QUIZ_NOT_FOUND')
check('deleted-manage-gone', api('GET',f'/api/manage/{tok}').get('code')=='DASHBOARD_INVALID')
check('deleted-share-gone', api('GET',f'/api/shared/{sid}').get('code')=='SHARE_NOT_FOUND')
print(f'\n{len(passed)} passed, {len(failed)} failed: {failed}')
sys.exit(1 if failed else 0)
