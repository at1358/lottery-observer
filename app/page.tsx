import Dashboard from './dashboard';
import LoginScreen from './login-screen';
import {principal,accountState} from '../lib/accounts';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{view?:string,folder?:string}>}){
 const query=await searchParams,user=await principal();
 if(!user)return <LoginScreen {...await accountState()}/>;
 return <Dashboard user={user} initialView={query.view||'overview'} initialFolder={query.folder||''}/>;
}
