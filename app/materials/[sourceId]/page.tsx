import Dashboard from '../../dashboard';
import {requireChatGPTUser} from '../../chatgpt-auth';
import {principal,accountState} from '../../../lib/accounts';
import LoginScreen from '../../login-screen';
export const dynamic='force-dynamic';
export default async function MaterialPage({params}:{params:Promise<{sourceId:string}>}){
 const {sourceId}=await params;
 const user=await principal();if(!user)return <LoginScreen {...await accountState()}/>;
 return <Dashboard user={user} initialSource={sourceId} initialView="archive"/>;
}
